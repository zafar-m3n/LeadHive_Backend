const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Role = sequelize.define(
  "Role",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    value: {
      type: DataTypes.STRING(40),
      allowNull: false,
      unique: true,
    },
    label: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
  },
  {
    tableName: "roles",
    timestamps: false,
    underscored: true,
  }
);

module.exports = Role;
