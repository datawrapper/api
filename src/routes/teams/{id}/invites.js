const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Op } = require('@datawrapper/orm').db;
const { User, Team, UserTeam } = require('@datawrapper/orm/models');
const crypto = require('crypto');

const { createResponseConfig } = require('../../../schemas/response.js');
const { logAction } = require('@datawrapper/orm/utils/action');

const {
    ROLE_OWNER,
    ROLE_ADMIN,
    ROLES,
    clearPluginCache,
    getMemberRole,
    canInviteUsers,
    getMaxTeamInvites,
    getPendingTeamInvites
} = require('../utils');

module.exports = async (server, options) => {
    // POST /v3/teams/{id}/invites
    server.route({
        method: 'POST',
        path: `/invites`,
        options: {
            tags: ['api'],
            description: 'Invite a person',
            auth: {
                access: { scope: ['team:write'] }
            },
            validate: {
                params: {
                    id: Joi.string()
                        .required()
                        .description('Team ID (eg. guardians-of-the-galaxy)')
                },
                payload: {
                    email: Joi.string()
                        .email()
                        .required()
                        .example('thor@gmail.com'),
                    role: Joi.string()
                        .valid(...ROLES)
                        .required()
                }
            },
            response: createResponseConfig({
                status: { '201': Joi.any().empty() }
            })
        },
        /**
         * handles POST /v3/teams/:id/invites
         */
        handler: inviteTeamMember
    });

    // POST /v3/teams/{id}/invites/{token}
    server.route({
        method: 'POST',
        path: '/invites/{token}',
        options: {
            tags: ['api'],
            description: 'Accept a team invitation',
            auth: {
                access: { scope: ['team:write'] }
            },
            validate: {
                params: {
                    id: Joi.string()
                        .required()
                        .description('Team ID (eg. guardians-of-the-galaxy)'),
                    token: Joi.string()
                        .required()
                        .description('A valid team invitation token')
                }
            },
            response: createResponseConfig({
                status: { '201': Joi.any().empty() }
            })
        },
        handler: acceptTeamInvitation
    });

    // DELETE /v3/teams/{id}/invites
    server.route({
        method: 'DELETE',
        path: `/invites/{token}`,
        options: {
            tags: ['api'],
            auth: false,
            description: 'Reject a team invitation',
            validate: {
                params: {
                    id: Joi.string()
                        .required()
                        .description('Team ID (eg. guardians-of-the-galaxy)'),
                    token: Joi.string()
                        .required()
                        .description('A valid team invitation token')
                }
            },
            response: createResponseConfig({
                status: { '204': Joi.any().empty() }
            })
        },
        handler: rejectTeamInvitation
    });
};

/**
 * handles POST /v3/teams/:id/invites/:token
 */
async function acceptTeamInvitation(request, h) {
    const { auth, params, server } = request;

    const user = auth.artifacts;

    const userTeam = await UserTeam.findOne({
        where: {
            user_id: user.id,
            organization_id: params.id,
            invite_token: params.token
        }
    });

    if (!userTeam) {
        return Boom.notFound();
    }

    if (userTeam.team_role === ROLE_OWNER) {
        // we're invited as owner, turn former owner
        // into team admin
        await UserTeam.update(
            {
                team_role: ROLE_ADMIN
            },
            {
                where: {
                    user_id: {
                        [Op.not]: user.id
                    },
                    team_role: ROLE_OWNER,
                    organization_id: params.id
                }
            }
        );
    }
    await userTeam.update({
        invite_token: ''
    });

    if (userTeam.team_role === ROLE_OWNER) {
        await server.app.events.emit(server.app.event.TEAM_OWNER_CHANGED, {
            id: params.id,
            owner_id: user.id
        });
    }

    // clear user plugin cache as user might have
    // access to new products now
    await clearPluginCache(user.id);

    logAction(userTeam.invited_by, 'team/invite/accept', params.id);

    return h.response().code(201);
}

/**
 * handles DELETE /v3/teams/:id/invites/:token
 */
async function rejectTeamInvitation(request, h) {
    const { params } = request;

    const userTeam = await UserTeam.findOne({
        where: {
            organization_id: params.id,
            invite_token: params.token
        }
    });

    if (!userTeam) {
        return Boom.notFound();
    }

    // remove invitation
    await userTeam.destroy();

    const user = await User.findByPk(userTeam.user_id);

    if (user) {
        // also remove user who never activated the account
        if (user.activate_token === params.token) {
            await user.destroy();
        }

        // and log email hash for future spam detection
        const hmac = crypto.createHash('sha256');
        hmac.update(user.email);
        logAction(userTeam.invited_by, 'team/invite/reject', hmac.digest('hex'));
    }

    return h.response().code(204);
}

/**
 * handles POST /v3/teams/:id/invites
 */
async function inviteTeamMember(request, h) {
    const { auth, params, payload, server } = request;

    const isAdmin = server.methods.isAdmin(request);

    const user = auth.artifacts;

    if (!isAdmin) {
        const memberRole = await getMemberRole(user.id, params.id);

        if (
            !canInviteUsers({
                userRole: user.role,
                memberRole,
                inviteeRole: payload.role
            })
        ) {
            return Boom.unauthorized();
        }
    }

    const maxTeamInvites = isAdmin
        ? false
        : await getMaxTeamInvites({
              server,
              teamId: params.id
          });

    if (maxTeamInvites !== false) {
        const pendingInvites = await getPendingTeamInvites({ user });
        if (pendingInvites >= maxTeamInvites) {
            const error = Boom.notAcceptable(
                `You already invited ${maxTeamInvites} user into teams. You can invite more users when invitations have been accepted.`
            );
            error.output.payload.data = { maxTeamInvites };
            return error;
        }
    }

    let inviteeWasCreated = false;

    const teamCount = await Team.count({
        where: { id: params.id }
    });

    if (!teamCount) return Boom.notFound();

    let invitee = await User.findOne({
        where: { email: payload.email },
        attributes: ['id', 'email', 'language']
    });

    const token = server.methods.generateToken();

    if (!invitee) {
        const passwordToken = server.methods.generateToken();
        const hash = await request.server.methods.hashPassword(passwordToken);
        invitee = await User.create({
            email: payload.email,
            activate_token: token,
            role: 'pending',
            pwd: hash,
            name: null
        });
        inviteeWasCreated = true;
    }

    const isMember = !!(await UserTeam.findOne({
        where: {
            user_id: invitee.id,
            organization_id: params.id
        }
    }));

    if (isMember) {
        return Boom.badRequest('User is already member of team.');
    }

    const data = {
        user_id: invitee.id,
        organization_id: params.id,
        team_role: payload.role,
        invite_token: token,
        invited_by: user.id
    };

    await UserTeam.create(data);
    const team = await Team.findByPk(data.organization_id);

    const { https, domain } = server.methods.config('frontend');
    const appUrl = `${https ? 'https' : 'http'}://${domain}`;
    await server.app.events.emit(server.app.event.SEND_EMAIL, {
        type: 'team-invite',
        to: invitee.email,
        language: invitee.language,
        data: {
            team_admin: auth.artifacts.email,
            team_name: team.name,
            activation_link: inviteeWasCreated
                ? `${appUrl}/datawrapper-invite/${data.invite_token}`
                : `${appUrl}/team/${team.id}/invite/${data.invite_token}/accept`,
            rejection_link: `${appUrl}/team/${team.id}/invite/${data.invite_token}/reject`
        }
    });

    await logAction(user.id, 'team/invite', { team: params.id, invited: invitee.id });

    return h.response().code(201);
}
