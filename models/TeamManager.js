const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const TeamManager = sequelize.define(
  "TeamManager",
  {
    team_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "teams", // Refers to the "teams" table
        key: "id",
      },
    },
    manager_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users", // Refers to the "users" table
        key: "id",
      },
    },
  },
  {
    tableName: "team_managers", // Explicitly define the table name
    timestamps: false, // No timestamps for this junction table
  }
);

module.exports = TeamManager;
