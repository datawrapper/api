const test = require('ava');
const { setup } = require('../../../../test/helpers/setup');
const get = require('lodash/get');
const has = require('lodash/has');
const set = require('lodash/set');

test.before(async t => {
    const { server, getTeamWithUser, getUser, models, addToCleanup } = await setup({
        usePlugins: false
    });
    const data = await getTeamWithUser();

    t.context.models = models;
    t.context.addToCleanup = addToCleanup;
    t.context.getTeamWithUser = getTeamWithUser;
    t.context.getUser = getUser;
    t.context.server = server;
    t.context.data = data;
    t.context.auth = {
        strategy: 'session',
        credentials: data.session,
        artifacts: data.user
    };
    t.context.headers = {
        cookie: 'crumb=abc',
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };

    // emulate team settings filter
    const { events, event } = server.app;
    events.on(event.TEAM_SETTINGS_FILTER, async ({ team, payload, user }) => {
        // check if the team supports certain settings
        const prohibitedKeys = [
            'settings.flags',
            'settings.css',
            'settings.default.metadata.visualize'
        ];
        const readOnlySettings = {};
        prohibitedKeys.forEach(key => {
            if (has(payload, key)) {
                const keys = key.split('.');
                const last = keys.pop();
                const readOnlySetting = get(team.dataValues, key);
                set(readOnlySettings, key, readOnlySetting);
                delete get(payload, keys.join('.'))[last];
            }
        });
        return readOnlySettings;
    });
});

test('[/v3/teams/:id] check that owners and admins can see owner, but members cannot', async t => {
    const { getTeamWithUser } = t.context;
    const { addUser, user: owner, session: ownerSession, team } = await getTeamWithUser();
    const { user: admin, session: adminSession } = await addUser('admin');
    const { user: member, session: memberSession } = await addUser('member');

    let teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: ownerSession,
            artifacts: owner
        }
    });

    t.is(typeof teams.result.owner, 'object');
    t.is(teams.result.owner.id, owner.id);

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: adminSession,
            artifacts: admin
        }
    });

    t.is(typeof teams.result.owner, 'object');
    t.is(teams.result.owner.id, owner.id);

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: memberSession,
            artifacts: member
        }
    });

    t.is(teams.result.owner, undefined);
});

test('[/v3/teams/:id] check that owners and admins can see settings, but members cannot', async t => {
    const { getTeamWithUser } = t.context;
    const { addUser, user: owner, session: ownerSession, team } = await getTeamWithUser();
    const { user: admin, session: adminSession } = await addUser('admin');
    const { user: member, session: memberSession } = await addUser('member');

    let teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: ownerSession,
            artifacts: owner
        }
    });

    t.is(typeof teams.result.settings, 'object');

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: adminSession,
            artifacts: admin
        }
    });

    t.is(typeof teams.result.settings, 'object');

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: memberSession,
            artifacts: member
        }
    });

    t.is(teams.result.settings, undefined);
});

test('user can fetch individual team', async t => {
    const teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: t.context.auth
    });

    t.is(teams.statusCode, 200);
    t.is(teams.result.id, t.context.data.team.id);
    t.is(teams.result.name, 'Test Team');
});

test('user can not fetch teams they are not a part of', async t => {
    const data = await t.context.getUser();
    const teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: {
            strategy: 'session',
            credentials: data.session,
            artifacts: data.user
        }
    });

    t.is(teams.statusCode, 401);
});

test('owners can edit team', async t => {
    const team = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: t.context.auth,
        headers: t.context.headers,
        payload: {
            name: 'Testy'
        }
    });

    t.is(team.statusCode, 200);
    t.is(team.result.name, 'Testy');
    t.truthy(team.result.updatedAt);
});

test('admin can edit team', async t => {
    const { user } = await t.context.data.addUser('admin');

    const team = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: {
            strategy: 'simple',
            credentials: { session: '', scope: ['team:write'] },
            artifacts: user
        },
        headers: t.context.headers,
        payload: {
            name: 'Testy'
        }
    });

    t.is(team.statusCode, 200);
    t.is(team.result.name, 'Testy');
    t.truthy(team.result.updatedAt);
});

test('member can not edit team', async t => {
    const { user } = await t.context.data.addUser('member');

    const team = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: {
            strategy: 'simple',
            credentials: { session: '', scope: ['team:write'] },
            artifacts: user
        },
        headers: t.context.headers,
        payload: {
            name: 'Testy'
        }
    });

    t.is(team.statusCode, 401);
});

test('admin can edit team allowed settings', async t => {
    const { user } = await t.context.data.addUser('admin');

    const team0 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: {
            strategy: 'simple',
            credentials: { session: '', scope: ['team:write'] },
            artifacts: user
        },
        headers: t.context.headers
    });

    t.is(team0.statusCode, 200);
    t.is(team0.result.settings.default.locale, 'en-US');
    t.is(team0.result.settings.flags.pdf, false);

    const team1 = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: {
            strategy: 'simple',
            credentials: { session: '', scope: ['team:write'] },
            artifacts: user
        },
        headers: t.context.headers,
        payload: {
            settings: {
                default: {
                    locale: 'fr-FR'
                }
            }
        }
    });

    t.is(team1.statusCode, 200);
    t.is(team1.result.settings.default.locale, 'fr-FR');
    t.is(team1.result.settings.flags.pdf, false);
    t.truthy(team1.result.updatedAt);

    const team2 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: {
            strategy: 'simple',
            credentials: { session: '', scope: ['team:write'] },
            artifacts: user
        },
        headers: t.context.headers
    });

    t.is(team2.statusCode, 200);
    t.is(team2.result.settings.default.locale, 'fr-FR');
    t.is(team2.result.settings.flags.pdf, false);
});

test("admins can't edit team restricted team settings", async t => {
    const { user } = await t.context.data.addUser('admin');

    const team1 = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: {
            strategy: 'simple',
            credentials: { session: '', scope: ['team:write'] },
            artifacts: user
        },
        headers: t.context.headers,
        payload: {
            settings: {
                flags: {
                    pdf: true
                }
            }
        }
    });

    t.is(team1.statusCode, 200);
    t.is(team1.result.settings.flags.pdf, false);
    t.truthy(team1.result.updatedAt);

    const team2 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: {
            strategy: 'simple',
            credentials: { session: '', scope: ['team:write'] },
            artifacts: user
        },
        headers: t.context.headers
    });

    t.is(team2.statusCode, 200);
    t.is(team2.result.settings.flags.pdf, false);
});

test('restricted team settings are preserved in PUT request', async t => {
    const { getTeamWithUser } = t.context;
    const { user, team } = await getTeamWithUser();

    const { settings } = team.dataValues;

    const requestPayload = {
        settings: {
            default: {
                locale: 'de-DE',
                metadata: {
                    publish: {
                        'embed-width': 500,
                        'embed-height': 300
                    },
                    visualize: {
                        'x-grid': false
                    }
                }
            },
            flags: {
                pdf: true,
                nonexistentflag: true
            },
            css: '',
            embed: {
                custom_embed: {
                    text: 'Copy and paste this ID into your CMS',
                    title: 'Chart ID',
                    template: '%chart_id%'
                },
                preferred_embed: 'responsive'
            }
        }
    };

    async function updateTeamSettings(payload) {
        return await t.context.server.inject({
            method: 'PUT',
            url: `/v3/teams/${team.id}`,
            auth: {
                strategy: 'simple',
                credentials: { session: '', scope: ['team:write'] },
                artifacts: user
            },
            headers: t.context.headers,
            payload
        });
    }

    const team1 = await updateTeamSettings(requestPayload);

    function testTeamSettings(team) {
        t.is(team.statusCode, 200);

        // was able to edit settings.embed
        t.is(team.result.settings.embed.custom_embed.text, 'Copy and paste this ID into your CMS');
        t.is(team.result.settings.embed.custom_embed.title, 'Chart ID');

        // was able to edit settings.default.local
        t.is(team.result.settings.default.locale, 'de-DE');

        // protected settings.css preserved
        t.is(team.result.settings.css, settings.css);

        // protected settings.flags preserved
        t.deepEqual(team.result.settings.flags, settings.flags);

        // metadata.publish saved, metadata.visualize dropped
        t.deepEqual(team.result.settings.default.metadata, {
            publish: {
                'embed-width': 500,
                'embed-height': 300
            }
        });
    }

    // check response
    testTeamSettings(team1);
    t.truthy(team1.result.updatedAt);

    const team2 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'simple',
            credentials: { session: '', scope: ['team:write'] },
            artifacts: user
        },
        headers: t.context.headers
    });

    // all expected changes persist
    testTeamSettings(team2);

    // PUT request can also delete nested items from the team settings
    delete requestPayload.settings.default.metadata.publish['embed-width'];
    delete requestPayload.settings.default.metadata.publish['embed-height'];

    const team3 = await updateTeamSettings(requestPayload);

    t.deepEqual(team3.result.settings.default.metadata, {
        publish: {}
    });
});
