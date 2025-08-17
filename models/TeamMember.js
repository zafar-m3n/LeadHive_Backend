const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const TeamMember = sequelize.define(
  "TeamMember",
  {
    team_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: {
        model: "teams",
        key: "id",
      },
    },
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: {
        model: "users",
        key: "id",
      },
    },
  },
  {
    tableName: "team_members",
    timestamps: false,
    underscored: true,
  }
);

module.exports = TeamMember;
