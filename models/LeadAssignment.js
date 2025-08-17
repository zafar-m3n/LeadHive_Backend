const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const LeadAssignment = sequelize.define(
  "LeadAssignment",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "leads",
        key: "id",
      },
    },
    assignee_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    assigned_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    assigned_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "lead_assignments",
    timestamps: false,
    underscored: true,
  }
);

module.exports = LeadAssignment;
