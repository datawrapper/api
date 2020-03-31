/**
 * Deeply assign the values of all enumerable-own-properties
 * from one or more source objects to a target object. Returns the target object.
 *
 * Based on and is almost identical to assign-deep (https://github.com/jonschlinkert/assign-deep/)
 *
 * There are 2 differences to assign-deep:
 *
 * 1. If a source object in any of the keys is empty, an empty object gets assigned
 *    instead of retaining entries from the target object
 * 2. No symbol assignment
 *
 * @param {Object} target object
 * @param {...Object} args - source object(s)
 *
 * @returns {Object}
 */

const assignWithEmptyObjects = (target, ...args) => {
    let i = 0;
    if (isPrimitive(target)) target = args[i++];
    if (!target) target = {};
    for (; i < args.length; i++) {
        if (isObject(args[i])) {
            for (const key of Object.keys(args[i])) {
                if (isValidKey(key)) {
                    if (isObject(target[key]) && isObject(args[i][key]) && !isEmpty(args[i][key])) {
                        assignWithEmptyObjects(target[key], args[i][key]);
                    } else {
                        target[key] = args[i][key];
                    }
                }
            }
        }
    }
    return target;
};

module.exports = assignWithEmptyObjects;

function isObject(val) {
    return typeof val === 'function' || toString.call(val) === '[object Object]';
}

function isPrimitive(val) {
    return typeof val === 'object' ? val === null : typeof val !== 'function';
}

function isEmpty(val) {
    return !val || Object.keys(val).length === 0;
}

const toString = Object.prototype.toString;

const isValidKey = key => {
    return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
};
