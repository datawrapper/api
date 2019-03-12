function cookieTTL(days) {
    return 1000 * 3600 * 24 * days; // 1000ms = 1s -> 3600s = 1h -> 24h = 1d
}

module.exports = {
    cookieTTL
};
