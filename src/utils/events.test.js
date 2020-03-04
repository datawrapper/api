import test from 'ava';
import EventEmitter from 'events';
import { ApiEventEmitter, eventList } from './events';
import { noop } from './index';

function mockLogger() {
    return { error: noop };
}

function uniq(arr) {
    return Array.from(new Set(arr));
}

test.beforeEach(t => {
    t.context.events = new ApiEventEmitter({ logger: mockLogger });
});

test('events is instance of Node EventEmitter', t => {
    t.true(t.context.events instanceof EventEmitter);
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
    t.context.events.on(eventList.GET_CHART_ASSET, () => {
        return 'test';
    });

    t.context.events.on(eventList.GET_CHART_ASSET, () => {
        throw Error('Boom');
    });

    const res = await t.context.events.emit(eventList.GET_CHART_ASSET);

    t.log('listener return values are available to emit');
    t.is(res[0].status, 'success');
    t.is(res[0].data, 'test');

    t.log('errors thrown in listener are available to emit');
    t.is(res[1].status, 'error');
    t.is(res[1].error.message, 'Boom');
    t.is(res[1].data, undefined);
});

test('emit with options', async t => {
    t.context.events.on(eventList.GET_CHART_ASSET, () => {
        return 'test';
    });

    t.context.events.on(eventList.GET_CHART_ASSET, () => {
        throw Error('Boom');
    });

    const res = await t.context.events.emit(eventList.GET_CHART_ASSET, undefined, {
        filter: 'success'
    });

    t.is(res.length, 1);
    t.is(res[0], 'test');
});

test('emit with filter', async t => {
    t.context.events.on(eventList.GET_CHART_ASSET, () => {
        return 'test1';
    });

    t.context.events.on(eventList.GET_CHART_ASSET, () => {
        return 'test2';
    });

    const res = await t.context.events.emit(eventList.GET_CHART_ASSET, undefined, {
        filter: (eventResult, i) => i
    });

    t.is(res.length, 1);
});

test('emit with first result', async t => {
    t.context.events.on(eventList.GET_CHART_ASSET, () => {
        return 'test1';
    });

    t.context.events.on(eventList.GET_CHART_ASSET, () => {
        return 'test2';
    });

    const res = await t.context.events.emit(eventList.GET_CHART_ASSET, undefined, {
        filter: 'first'
    });

    t.is(res, 'test1');
});

test('emit with first result (error)', async t => {
    t.context.events.on(eventList.GET_CHART_ASSET, () => {
        throw Error('Boom');
    });

    const res = t.context.events.emit(eventList.GET_CHART_ASSET, undefined, {
        filter: 'first'
    });

    await t.throwsAsync(res, { instanceOf: Error, message: 'Boom' });
});
