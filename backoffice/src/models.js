import { Sequelize, DataTypes } from 'sequelize';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Defina DATABASE_URL no arquivo .env');
}

export const sequelize = new Sequelize(databaseUrl, { logging: false });

// Usuários do backoffice (quem acessa o painel)
export const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: {
      type: DataTypes.STRING(160),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
      set(value) {
        this.setDataValue('email', String(value).trim().toLowerCase());
      },
    },
    passwordHash: { type: DataTypes.STRING(120), allowNull: false },
    role: {
      type: DataTypes.ENUM('admin', 'operador', 'visualizador'),
      allowNull: false,
      defaultValue: 'visualizador',
    },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: 'usuarios' },
);

// Registro do dia (o mesmo conteúdo que a página salva hoje no navegador)
export const Registro = sequelize.define(
  'Registro',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Guardada como texto AAAA-MM-DD: o adaptador do AdminJS desloca DATEONLY
    // um dia em fusos negativos (como o de Brasília).
    data: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,
      validate: { is: /^\d{4}-\d{2}-\d{2}$/ },
    },
    temNoticia: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    valores: { type: DataTypes.JSON, allowNull: false },
    total: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
    classificacao: { type: DataTypes.STRING(60), allowNull: false },
    resultadoDia: {
      type: DataTypes.ENUM('POSITIVA', 'NEGATIVA'),
      allowNull: false,
      defaultValue: 'POSITIVA',
    },
    observacoes: { type: DataTypes.TEXT },
    // Print do gráfico em data URL (JPEG comprimido no navegador)
    imagem: { type: DataTypes.TEXT },
  },
  { tableName: 'registros' },
);

Registro.belongsTo(User, { as: 'criadoPor', foreignKey: 'criadoPorId' });
