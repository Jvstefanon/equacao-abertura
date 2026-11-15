# Backoffice da Equação da Abertura

Banco PostgreSQL, painel administrativo (AdminJS), tela de entrada da página e API de registros.
Tudo roda em um único servidor Node.js.

## Como rodar

1. Instale o PostgreSQL e crie o banco:

   ```sql
   CREATE DATABASE equacao_abertura;
   ```

2. Na pasta `backoffice`, instale as dependências:

   ```bash
   npm install
   ```

3. Copie `.env.example` para `.env` e preencha `DATABASE_URL`, `SESSION_SECRET`,
   `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Use uma senha forte e um `SESSION_SECRET` longo e aleatório.

4. Crie o primeiro administrador:

   ```bash
   npm run seed
   ```

5. Inicie o servidor:

   ```bash
   npm start
   ```

6. Acesse:
   - `http://localhost:3000/entrar`: tela de login da página principal.
   - `http://localhost:3000/admin`: painel do backoffice (mesmos usuários).

## Os testes

Com o banco configurado no `.env`:

```bash
npm test
```

Os testes cobrem login (senha certa, senha errada, usuário inativo, limite de tentativas),
proteção da API por papel, gravação com a data correta, bloqueio de requisições de outro site
e a lista de arquivos servidos. Eles criam e apagam usuários de teste com e-mail `@teste-api.com`.

## Papéis e permissões

| Papel         | Painel: usuários                          | Registros (painel e página)     |
|---------------|-------------------------------------------|---------------------------------|
| admin         | criar, editar, excluir, ativar/desativar  | consultar, criar, editar, excluir |
| operador      | sem acesso                                | consultar, criar, editar        |
| visualizador  | sem acesso                                | somente consulta                |

Regras já aplicadas:

- A senha é guardada como hash (bcrypt). Nunca aparece nas respostas nem na lista do painel.
- Usuário desativado perde o acesso na hora, mesmo com sessão aberta.
- Mudança de papel vale na próxima requisição.
- Ninguém exclui nem desativa a própria conta pelo painel.
- O autor do registro é o usuário da sessão, nunca um valor enviado pelo navegador.
- Limite de 5 tentativas erradas por IP em 15 minutos (resposta 429).
- Requisições de outro site são recusadas (CSRF); a API só aceita JSON.
- Só os arquivos da página são servidos. Nada de `backoffice/` é acessível pelo navegador.

## Rotas da API

Todas (exceto o login) exigem sessão.

| Método | Rota                    | Quem                       | Descrição                                   |
|--------|-------------------------|----------------------------|---------------------------------------------|
| POST   | `/api/auth/login`       | todos                      | Entra com e-mail e senha                    |
| POST   | `/api/auth/logout`      | logado                     | Encerra a sessão                            |
| GET    | `/api/auth/me`          | logado                     | Usuário da sessão (401 se não houver)       |
| GET    | `/api/registros`        | todos os papéis           | Lista do mais recente para o mais antigo    |
| GET    | `/api/registros/:data`  | todos os papéis           | Um registro (`AAAA-MM-DD`)                  |
| PUT    | `/api/registros/:data`  | admin, operador            | Cria ou atualiza o registro do dia          |
| DELETE | `/api/registros/:data`  | admin                      | Exclui o registro do dia                    |

## Estrutura

- `src/models.js`: tabelas `usuarios` e `registros`.
- `src/app.js`: monta o servidor (sessão, API, páginas, painel AdminJS).
- `src/auth.js`: login, logout, limite de tentativas e middlewares de sessão e papel.
- `src/registros.js`: API de registros e validação dos dados.
- `src/index.js`: sincroniza o banco e sobe o servidor.
- `src/seed.js`: cria o primeiro administrador.
- `test/api.test.js`: testes automatizados.

Arquivos da página, na pasta `site/` (ao lado de `backoffice/`): `login.html`, `login.js`, `login.css`, `index.html`,
`app.js`, `style.css`.

## Sessão

A página e o painel AdminJS usam a mesma sessão, guardada na tabela `session`.
Ela é criada sozinha no primeiro uso (`createTableIfMissing`), então não há passo manual.
Expira em 8 horas.

## Próximos passos

- Em produção, rode atrás de HTTPS e com `NODE_ENV=production` (o cookie de sessão fica seguro).
- Faça backup do PostgreSQL regularmente.
- Para mudanças futuras no esquema, use migrações em vez de `sequelize.sync()`.
  O `sync()` cria tabelas novas, mas não altera tabelas que já existem.
- Se o banco já tinha a tabela `registros` de uma versão anterior, recrie-a
  (ou adicione a coluna `imagem`, tipo texto) antes de usar a nova versão.
