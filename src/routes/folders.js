const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Chart, User, Folder, Team } = require('@datawrapper/orm/models');

const routes = [
    {
        method: 'GET',
        path: '/',
        handler: async function getAllFolders(request, h) {
            const { auth } = request;

            const { teams } = await User.findByPk(auth.artifacts.id, {
                include: [{ model: Team, attributes: ['id', 'name'] }]
            });

            const all = [
                {
                    type: 'user',
                    id: auth.artifacts.id,
                    charts: (await Chart.findAll({
                        attributes: ['id', 'title', 'type', 'theme', 'createdAt'],
                        where: { author_id: auth.artifacts.id, in_folder: null }
                    })).map(cleanChart),
                    folders: await getFolders('user_id', auth.artifacts.id)
                }
            ];

            for (let team of teams) {
                all.push({
                    type: 'team',
                    id: team.id,
                    name: team.name,
                    charts: (await Chart.findAll({
                        attributes: ['id', 'title', 'type', 'theme', 'createdAt'],
                        where: { organization_id: team.id, in_folder: null }
                    })).map(cleanChart),
                    folders: await getFolders('org_id', team.id)
                });
            }

            function cleanChart(chart) {
                return {
                    id: chart.id,
                    title: chart.title,
                    type: chart.type,
                    theme: chart.theme,
                    createdAt: chart.createdAt
                };
            }

            async function getFolders(by, owner, parent) {
                let arr = [];
                const folders = await Folder.findAll({
                    where: { [by]: owner, parent_id: parent || null }
                });

                for (let folder of folders) {
                    arr.push({
                        id: folder.id,
                        name: folder.name,
                        charts: await Chart.findAll({ where: { in_folder: folder.id } }).map(
                            cleanChart
                        ),
                        folders: await getFolders(by, owner, folder.id)
                    });
                }

                return arr;
            }

            return all;
        }
    },
    {
        method: 'POST',
        path: '/',
        payload: Joi.object({
            organizationId: Joi.string()
                .optional()
                .description(
                    'Organization that the folder belongs to. If organizationId is empty, the folder will belong to the user directly.'
                ),
            parentId: Joi.number().optional(),
            name: Joi.string()
        }),
        handler: async function(request, h) {
            const { auth, server, payload } = request;
            const isAdmin = server.methods.isAdmin(request);

            const user = await User.findOne({ where: { id: auth.artifacts.id } });

            const folderParams = {
                name: payload.name
            };

            if (payload.organizationId) {
                if (!isAdmin && !(await user.hasTeam(payload.organizationId))) {
                    return Boom.unauthorized('User does not have access to the specified team.');
                }

                folderParams.org_id = payload.organizationId;
            } else {
                folderParams.user_id = auth.artifacts.id;
            }

            if (payload.parentId) {
                // check if folder belongs to user to team
                const folder = await Folder.findOne({ where: { id: payload.parentId } });

                if (
                    !folder ||
                    (!isAdmin &&
                        folder.user_id !== auth.artifacts.id &&
                        !(await user.hasTeam(folder.org_id)))
                ) {
                    return Boom.unauthorized(
                        'User does not have access to the specified parent folder, or it does not exist.'
                    );
                }

                folderParams.org_id = folder.org_id ? folder.org_id : null;
                folderParams.user_id = folder.org_id ? null : folderParams.user_id;
                folderParams.parent_id = folder.id;
            }

            const newFolder = await Folder.create(folderParams);

            return h
                .response({
                    id: newFolder.id,
                    name: newFolder.name,
                    organizationId: newFolder.org_id,
                    userId: newFolder.user_id,
                    parentId: newFolder.parent_id
                })
                .code(201);
        }
    }
];

module.exports = {
    name: 'folders-routes',
    version: '1.0.0',
    register: (server, options) => {
        routes.forEach(route => {
            server.route({
                method: route.method,
                path: route.path,
                options: {
                    tags: ['api'],
                    validate: {
                        params: route.params,
                        query: route.query,
                        payload: route.payload
                    }
                },
                handler: route.handler
            });
        });
    }
};
