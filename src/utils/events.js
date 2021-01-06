const EventEmitter = require('events');
const { noop } = require('./index');

/**
 * Custom event emitter that collects results of event listeners
 *
 * @class ApiEventEmitter
 * @extends {EventEmitter}
 */
class ApiEventEmitter extends EventEmitter {
    constructor({ logger } = {}) {
        super();
        this.logger = logger || noop;
    }

    /**
     * Emit function that calls all listeners and returns Promise of their results
     *
     * @private
     * @param {string} event - Name of event to emit
     * @param {any} [data] - Data to pass to event listeners
     * @return {Promise} - Promise of event results as array
     * @memberof ApiEventEmitter
     */
    async __private__emit(event, data) {
        if (!eventList[event]) {
            throw new TypeError(`Invalid event name (${event})`);
        }

        const listeners = this.listeners(event);

        const result = listeners.map(async func => {
            try {
                const result = await func(data);
                return { status: 'success', data: result };
            } catch (error) {
                if (error.name !== 'CodedError') {
                    // only log unknown errors
                    this.logger().error(error, `[Event] ${event}`);
                }
                return { status: 'error', error };
            }
        });

        return Promise.all(result);
    }

    /**
     * Filter a list of event results
     *
     * @param {array} eventResults - List of event results
     * @param {function|string} filter - Result filter
     * @returns {array|object} - List or single event result
     * @memberof ApiEventEmitter
     */
    filterEventResults(eventResults, filter) {
        if (typeof filter === 'function') {
            return eventResults.filter(filter);
        }

        if (filter === 'first') {
            const firstResult = eventResults.find(r => r.status === 'success') || {};
            return firstResult.data ? [firstResult.data] : [];
        }

        if (filter === 'success') {
            return eventResults.filter(r => r.status === 'success').map(r => r.data);
        }

        return eventResults;
    }

    /**
     * Emit function with options
     *
     * @param {string} event - Name of event to emit
     * @param {any} [data] - Data to pass to event listeners
     * @param {object} [options] - Options object to modify returned results
     * @param {function|string} [options.filter] - Result filter
     * @return {Promise} - Promise of event results
     * @memberof ApiEventEmitter
     */
    async emit(event, data, options = {}) {
        const results = await this.__private__emit(event, data);

        let eventResults = results;
        if (options.filter) {
            eventResults = this.filterEventResults(eventResults, options.filter);

            if (!eventResults.length) {
                const errorResult = results.find(r => r.status === 'error');

                if (errorResult) {
                    throw errorResult.error;
                }
            }
        }

        if (options.filter === 'first') return eventResults[0];

        return eventResults;
    }
}

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
    GET_NEXT_PUBLIC_URL: 'GET_NEXT_PUBLIC_URL'
};

module.exports = { ApiEventEmitter, eventList };
