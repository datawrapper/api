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
     * @param {string} event - Name of event to emit
     * @param {any} [data] - Data to pass to event listeners
     * @return {Promise} - Promise of event results as array
     * @memberof ApiEventEmitter
     */
    async emit(event, data) {
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
}

const eventList = {
    CHART_EXPORT: 'CHART_EXPORT',
    GET_CHART_ASSET: 'GET_CHART_ASSET',
    PUT_CHART_ASSET: 'PUT_CHART_ASSET',
    SEND_EMAIL: 'SEND_EMAIL',
    MAX_TEAM_INVITES: 'MAX_TEAM_INVITES',
    USER_DELETED: 'USER_DELETED',
    TEAM_CREATED: 'TEAM_CREATED',
    TEAM_OWNER_CHANGED: 'TEAM_OWNER_CHANGED'
};

module.exports = { ApiEventEmitter, eventList };
