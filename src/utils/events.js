const ApiEventEmitter = require('@datawrapper/service-utils/eventEmitter');

const eventList = {
    CHART_EXPORT: 'CHART_EXPORT',
    GET_CHART_ASSET: 'GET_CHART_ASSET',
    PUT_CHART_ASSET: 'PUT_CHART_ASSET',
    CHART_COPY: 'CHART_COPY',
    CHART_FORK: 'CHART_FORK',
    SEND_EMAIL: 'SEND_EMAIL',
    MAX_TEAM_INVITES: 'MAX_TEAM_INVITES',
    USER_DELETED: 'USER_DELETED',
    TEAM_CREATED: 'TEAM_CREATED',
    TEAM_OWNER_CHANGED: 'TEAM_OWNER_CHANGED',
    PUBLISH_CHART: 'PUBLISH_CHART',
    CHART_DELETED: 'CHART_DELETED',
    CHART_PUBLISHED: 'CHART_PUBLISHED',
    AFTER_CHART_PUBLISHED: 'AFTER_CHART_PUBLISHED',
    CUSTOM_EXTERNAL_DATA: 'CUSTOM_EXTERNAL_DATA',
    ADDITIONAL_CHART_DATA: 'ADDITIONAL_CHART_DATA',
    GET_CHART_DISPLAY_URL: 'GET_CHART_DISPLAY_URL',
    CHART_AFTER_BODY_HTML: 'CHART_AFTER_BODY_HTML',
    CHART_AFTER_HEAD_HTML: 'CHART_AFTER_HEAD_HTML',
    CHART_BLOCKS: 'CHART_BLOCKS',
    CHART_PUBLISH_DATA: 'CHART_PUBLISH_DATA',
    PLUGINS_LOADED: 'PLUGINS_LOADED',
    EXTERNAL_DATA_URL: 'EXTERNAL_DATA_URL'
};

module.exports = { ApiEventEmitter, eventList };
