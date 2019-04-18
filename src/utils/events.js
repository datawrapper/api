const EventEmitter = require('events');

/**
 * Custom event emitter that collects results of event listeners
 *
 * @class ApiEventEmitter
 * @extends {EventEmitter}
 */
class ApiEventEmitter extends EventEmitter {
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
                return { status: 'error', error };
            }
        });

        return Promise.all(result);
    }
}

const events = new ApiEventEmitter();

const eventList = {
    GET_CHART_DATA: 'GET_CHART_DATA',
    PUT_CHART_DATA: 'PUT_CHART_DATA'
};

module.exports = { events, eventList };
