const { db } = require('@datawrapper/orm');

const queries = {};

function SQL(strings, ...values) {
    let str = '';

    strings.forEach((string, i) => {
        string = string.replace(/\n/g, ' ').replace(/\s+/g, ' ');
        /* 0 is a valid value but falsy. This is checking for null and undefined. */
        str += string + (values[i] == null ? '' : values[i]);
    });

    return str;
}

queries.queryUsers = async function ({
    attributes,
    limit,
    offset,
    orderBy,
    order,
    search = '',
    teamId
}) {
    const WHERE = SQL`WHERE
user.deleted IS NOT TRUE
${search ? `AND (user.email LIKE '%${search}%' OR user.name LIKE '%${search}%')` : ''}
${
    teamId
        ? `AND user.id IN (SELECT user_id FROM user_organization WHERE organization_id = '${teamId}')`
        : ''
}
`;

    const userQuery = SQL`SELECT ${attributes.join(',')}
FROM \`user\`
LEFT JOIN \`chart\` ON user.id = chart.author_id
${WHERE}
GROUP BY user.id
ORDER BY ${orderBy} ${order}
LIMIT ${offset}, ${limit}
  `;

    const countQuery = SQL`SELECT COUNT(user.id) AS count
FROM \`user\`
${WHERE}
  `;

    const [rows, count] = await Promise.all([
        db.query(userQuery, {
            type: db.QueryTypes.SELECT
        }),
        db.query(countQuery, {
            type: db.QueryTypes.SELECT
        })
    ]);

    return { rows, count: count[0].count };
};

module.exports = queries;
