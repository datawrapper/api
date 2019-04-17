const EventEmitter = require('events');

class ApiEventEmitter extends EventEmitter {
    async emit(event, obj = {}) {
        const listeners = this.listeners(event);

        const result = listeners.map(async func => {
            try {
                const data = await func(obj);
                return { status: 'success', data };
            } catch (error) {
                return { status: 'error', error };
            }
        });

        return Promise.all(result);
    }
}

const apiEvents = new ApiEventEmitter();

module.exports = apiEvents;
