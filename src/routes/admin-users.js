const sequelize = require('sequelize');
const { decamelize, camelizeKeys } = require('humps');
const { User, Chart } = require('@datawrapper/orm/models');

const { Op } = sequelize;
const attributes = ['id', 'email', 'name', 'role', 'language', 'created_at'];

async function getAllUsers(request, h) {
    const { query } = request;

    const options = {
        order: [[decamelize(query.orderBy), query.order]],
        attributes,
        limit: query.limit,
        offset: query.offset
    };

    if (query.search) {
        options.where = {
            email: {
                [Op.like]: `%${query.search}%`
            }
        };
    }

    const { count, rows } = await User.findAndCountAll(options);

    return {
        list: rows.map(({ dataValues }) => camelizeKeys(dataValues)),
        total: count
    };
}

async function getUser(request, h) {
    const userId = request.params.id;
    const [user, chartCount] = await Promise.all([
        User.findByPk(userId, { attributes }),
        Chart.count({ where: { author_id: userId } })
    ]);

    return {
        ...camelizeKeys(user.dataValues),
        chartCount
    };
}

async function editUser(request, h) {
    const userId = request.params.id;
    await User.update(request.payload, {
        where: { id: userId }
    });

    const updatedAt = new Date().toISOString();
    const user = await getUser(request, h);

    return {
        ...user,
        updatedAt
    };
}

module.exports = {
    getAllUsers,
    getUser,
    editUser
};
