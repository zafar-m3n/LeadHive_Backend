const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Team = sequelize.define(
  "Team",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: "teams",
    timestamps: false,
    underscored: true,
  }
);

module.exports = Team;
