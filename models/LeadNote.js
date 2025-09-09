const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const LeadNote = sequelize.define(
  "LeadNote",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: "leads", key: "id" },
    },
    author_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "lead_notes",
    timestamps: false,
    underscored: true,
  }
);

module.exports = LeadNote;
