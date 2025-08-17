const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const SavedFilter = sequelize.define(
  "SavedFilter",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    is_shared: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    definition_json: {
      type: DataTypes.JSON,
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
    tableName: "saved_filters",
    timestamps: false,
    underscored: true,
    indexes: [
      {
        name: "uq_saved_filters_user_name",
        unique: true,
        fields: ["user_id", "name"],
      },
    ],
  }
);

module.exports = SavedFilter;
