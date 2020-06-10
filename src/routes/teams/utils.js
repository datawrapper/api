const { UserTeam, UserPluginCache } = require('@datawrapper/orm/models');
const { Op } = require('@datawrapper/orm').db;
const Boom = require('@hapi/boom');

const ROLE_OWNER = 'owner';
const ROLE_ADMIN = 'admin';
const ROLE_MEMBER = 'member';
const ROLES = [ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER];

/*
 * todo: move this to orm
 */
module.exports = {
    getMemberRole,
    canInviteUsers,
    getMaxTeamInvites,
    clearPluginCache,
    getPendingTeamInvites,
    canChangeMemberStatus,
    convertKeys,
    ROLE_OWNER,
    ROLE_ADMIN,
    ROLE_MEMBER,
    ROLES
};

async function getMemberRole(userId, teamId) {
    const userTeamRow = await UserTeam.findOne({
        where: {
            user_id: userId,
            organization_id: teamId
        }
    });

    if (!userTeamRow) {
        throw Boom.unauthorized();
    }

    return userTeamRow.team_role;
}

function canInviteUsers({ userRole, memberRole, inviteeRole }) {
    if (userRole === 'pending') {
        // only activated users may invite users
        return false;
    }
    if (memberRole !== ROLE_ADMIN && memberRole !== ROLE_OWNER) {
        // only team admins and team owners may invite users
        return false;
    }
    if (memberRole !== ROLE_OWNER && inviteeRole === ROLE_OWNER) {
        // only a team owner may invite a new owner
        return false;
    }
    return true;
}

async function getMaxTeamInvites({ teamId, server }) {
    const maxTeamInvitesRes = await server.app.events.emit(
        server.app.event.MAX_TEAM_INVITES,
        { teamId },
        { filter: 'success' }
    );

    const maxTeamInvites = maxTeamInvitesRes
        .map(({ data }) => (data ? data.maxInvites : false))
        .sort()
        .pop();

    return maxTeamInvites !== undefined ? maxTeamInvites : false;
}

async function clearPluginCache(userId) {
    return UserPluginCache.destroy({
        where: {
            user_id: userId
        }
    });
}

async function getPendingTeamInvites({ user }) {
    return UserTeam.count({
        where: {
            invited_by: user.id,
            invite_token: {
                [Op.not]: ''
            }
        }
    });
}

function canChangeMemberStatus({ memberRole, userRole }) {
    if (!memberRole) {
        return false;
    }
    if (memberRole === ROLE_MEMBER) {
        // only admins and owners may change member status
        return false;
    }
    if (memberRole !== ROLE_OWNER && userRole === ROLE_OWNER) {
        // only team owners may set a new team owner
        return false;
    }
    return true;
}

function convertKeys(input, method) {
    const output = {};
    for (const k in input) {
        output[method(k)] = input[k];
    }
    return output;
}
