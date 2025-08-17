const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const LeadSource = sequelize.define(
  "LeadSource",
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
    tableName: "lead_sources",
    timestamps: false,
    underscored: true,
  }
);

module.exports = LeadSource;
