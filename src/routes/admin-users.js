const sequelize = require('sequelize');
const nanoid = require('nanoid');
const bcrypt = require('bcrypt');
const { decamelize, camelizeKeys } = require('humps');
const { User, Chart } = require('@datawrapper/orm/models');

User.hasMany(Chart, { foreignKey: 'author_id' });
Chart.belongsTo(User, { foreignKey: 'author_id' });

const { Op } = sequelize;
const attributes = ['id', 'email', 'name', 'role', 'language', 'created_at'];

async function getAllUsers(request, h) {
    const { query } = request;

    const options = {
        order: [[decamelize(query.orderBy), query.order]],
        attributes,
        include: [
            {
                model: Chart,
                attributes: ['id']
            }
        ],
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

    const [users, count] = await Promise.all([
        User.findAll(options),
        User.count({ where: options.where })
    ]);

    return {
        list: users.map(({ dataValues }) => {
            const { charts, ...data } = dataValues;
            return camelizeKeys({ ...data, chartCount: charts.length });
        }),
        total: count
    };
}

async function getUser(request, h) {
    const userId = request.params.id;
    const { dataValues } = await User.findByPk(userId, {
        attributes,
        include: [{ model: Chart, attributes: ['id'] }]
    });

    const { charts, ...data } = dataValues;
    return camelizeKeys({
        ...data,
        chartCount: charts.length
    });
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

async function createUser(request, h) {
    const password = await bcrypt.hash(nanoid(), 14);

    const newUser = {
        role: 'pending',
        ...request.payload,
        pwd: password
    };

    const userModel = await User.create(newUser);
    const { pwd, ...user } = userModel.dataValues;
    return h.response(user).code(201);
}

module.exports = {
    getAllUsers,
    getUser,
    editUser,
    createUser
};
