const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const LeadStatus = sequelize.define(
  "LeadStatus",
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
    tableName: "lead_statuses",
    timestamps: false,
    underscored: true,
  }
);

module.exports = LeadStatus;
