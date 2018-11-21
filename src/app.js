const express = require('express');
const app = express();
const {Chart} = require('./db/models');

module.exports = app;

Chart.find({ id: "08QXP" }, function (err, charts) {
    // SQL: "SELECT * FROM person WHERE surname = 'Doe'"
    if (err) throw err;

    console.log("Charts found: %d", charts.length);
    console.log("First chart", charts[0].metadata.visualize);

    // charts[0].deleted = true;
    // charts[0].save(function (err) {
    //     console.log(err);
    //     // err.msg == "under-age";
    // });
});
