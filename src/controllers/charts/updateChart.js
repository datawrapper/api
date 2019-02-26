module.exports = (req, res) => {
    const { chart } = res.locals;

    const data = req.body;
    let changed = false;

    ['title', 'type', 'theme', 'last_edit_step', 'language', 'metadata'].forEach(key => {
        // todo: compare metadata json structure
        if (data[key] && data[key] !== chart[key]) {
            changed = true;
            chart[key] = data[key];
        }
    });

    if (changed) {
        chart.last_modified_at = new Date();

        chart.save().then(() => {
            res.status(200).send({ status: 'ok' });
        });
    } else {
        res.send({ status: 'ok', message: 'no changes' });
    }
};
