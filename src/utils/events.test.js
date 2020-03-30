const test = require('ava');
const EventEmitter = require('events');
const { ApiEventEmitter, eventList } = require('./events');
const { noop } = require('./index');

function mockLogger() {
    return { error: noop };
}

const events = new ApiEventEmitter({ logger: mockLogger });

function uniq(arr) {
    return Array.from(new Set(arr));
}

test.beforeEach(t => {
    events.removeAllListeners(eventList.GET_CHART_ASSET);
});

test('events is instance of Node EventEmitter', t => {
    t.true(events instanceof EventEmitter);
});

test('eventList has string values', t => {
    Object.values(eventList).forEach(eventName => {
        t.is(typeof eventName, 'string');
    });
});

test('eventList has no duplicate event names', t => {
    t.deepEqual(uniq(Object.values(eventList)), Object.values(eventList));
});

test('emit', async t => {
    events.on(eventList.GET_CHART_ASSET, () => {
        return 'test';
    });

    events.on(eventList.GET_CHART_ASSET, () => {
        throw Error('Boom');
    });

    const res = await events.emit(eventList.GET_CHART_ASSET);

    t.log('listener return values are available to emit');
    t.is(res[0].status, 'success');
    t.is(res[0].data, 'test');

    t.log('errors thrown in listener are available to emit');
    t.is(res[1].status, 'error');
    t.is(res[1].error.message, 'Boom');
    t.is(res[1].data, undefined);
});
