const express = require('express');
const app = express();
const {Chart, ExportJob} = require('./models');

module.exports = app;

Chart.findById('sgBf1').then(chart => {
    console.log(chart.metadata.visualize);
});

function newJob() {
    ExportJob.create({
        priority: 0,
        chart_id: 'sgBf1',
        status: 'queued',
        created_at: new Date(),
        data: {
            tasks: [{
                action: 'png',
                params: {
                    url: 'https://datawrapper.dwcdn.net/cYj95/4/plain.html',
                    sizes: [{
                        zoom: 4,
                        width: 400-20,
                        height: 300-20,
                        out: './output/twitter.png'
                    }, {
                        zoom: 2,
                        width: 600,
                        height: 'auto',
                        out: './output/bars-full.png'
                    }]
                }
            }, {
                action: 'border',
                params: {
                    image: './output/twitter.png',
                    padding: 10,
                    color: '#ffffff',
                    out: './output/twitter.png',
                }
            }, {
                action: 's3',
                params: {
                    file: './output/twitter.png',
                    bucket: 'local-dw-gka',
                    path: 'test/twitter.png'
                }
            }, {
                action: 's3',
                params: {
                    file: './output/bars-full.png',
                    bucket: 'local-dw-gka',
                    path: 'test/bars-full.png'
                }
            }]
        }
    }).then(job => {
        console.log(JSON.stringify(job));
    })
}

newJob();
