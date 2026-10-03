# Controle de Diárias

App de celular (PWA) para o encarregado da obra marcar a chamada do dia, lançar custos extras e vales, registrar pagamentos com recibo, fechar a semana e gerar o relatório.

## Como funciona

- **Login**: e-mail e senha pelo Supabase Auth. Cada conta só enxerga os próprios dados.
- **Sem internet**: tudo o que é marcado fica guardado no celular e entra numa fila. Quando o sinal volta, a fila é enviada ao Supabase sozinha. O app também abre sem internet depois do primeiro acesso (service worker em `sw.js`).
- **Fechar semana**: grava um registro em `fechamentos`. A partir daí o próprio banco recusa qualquer presença, custo extra, dia sem obra ou vale daquela semana. Não existe como reabrir.
- **Dia pago**: depois de registrar o pagamento, as presenças até a data paga também ficam travadas no banco.

## Estrutura

| Arquivo | O que é |
|---|---|
| `index.html` | Página do app e estilos |
| `js/app.js` | Telas, regras, dados locais e sincronização |
| `js/config.js` | Endereço do Supabase e chave publicável |
| `js/supabase.js` | Biblioteca do Supabase (cópia local para funcionar offline) |
| `sw.js` | Guarda o app no celular para abrir sem internet |
| `manifest.webmanifest`, `icons/` | Instalação na tela inicial |
| `supabase/migrations/` | Estrutura do banco: tabelas, regras de acesso e travas |

## Banco de dados (Supabase)

Projeto **Controle de Diarias** (região São Paulo, `xhttdjiyfxybgsoqdfws`).

Tabelas: `obras`, `pessoas`, `presencas`, `dias_obra`, `extras`, `pagamentos`, `vales`, `fechamentos`.
Nada é apagado de verdade: itens removidos ficam com `apagado = true`, para o histórico do relatório continuar fechando.

## Ajustes no painel do Supabase (Authentication)

1. **URL Configuration**: em *Site URL*, coloque o endereço publicado do app (ex.: `https://controle-diarias.vercel.app`) e adicione o mesmo em *Redirect URLs*. Sem isso, os links de confirmação de e-mail e de nova senha apontam para o endereço errado.
2. **Depois que o encarregado criar a conta**: em *Sign In / Providers*, desligue *Allow new users to sign up*, para ninguém mais criar conta.
3. **Recomendado**: ative *Leaked password protection* (bloqueia senhas que já vazaram na internet). Disponível conforme o plano.

## Publicar uma atualização

1. Altere os arquivos.
2. Em `sw.js`, aumente `VERSAO` (ex.: `diarias-v2`) para os celulares baixarem a versão nova.
3. Mudanças no banco entram como um novo arquivo em `supabase/migrations/`.

## Testar sem servidor

Abra o app com `?demo` no endereço (ex.: `index.html?demo`). Os dados ficam só no aparelho e nada é enviado.
