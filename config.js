/* ==================================================================
   config.js — ÁREA DE CONFIGURAÇÃO (é aqui que você mais mexe)
   ------------------------------------------------------------------
   Para acrescentar uma pessoa, mudar uma cor ou um tempo de aviso,
   edite SÓ este arquivo. Atenção às aspas e às vírgulas entre itens.
   Depois de editar, aumente o número ?v=1 no index.html e no início
   do app.js (por exemplo, ?v=2) para todo mundo receber a versão nova.
   ================================================================== */

/* ---------- 1. Firebase (identificação do projeto) ---------- */
export const firebaseConfig={
  apiKey:"AIzaSyDUbRGy8MVkeuUyKWuKEDi5lOqPERbvoUc",
  authDomain:"controle-de-pedidos-dipel.firebaseapp.com",
  projectId:"controle-de-pedidos-dipel",
  storageBucket:"controle-de-pedidos-dipel.firebasestorage.app",
  messagingSenderId:"474522616645",
  appId:"1:474522616645:web:79b40905e6f52b08df342c",
  measurementId:"G-P8LBB810JG"
};

/* ---------- 2. Usuários e filiais ----------
   O usuário digita só o nome (ex.: matriz). O sistema acrescenta o DOMÍNIO.
   ATENÇÃO: usuários novos também precisam estar nas regras do Firestore. */
export const DOMINIO='@setta.app';

/* Usuários que não são de filial: usuário -> papel (admin, separador, entregador) */
export const PAPEIS={admin:'admin',hebert:'admin',separador:'separador',entregador:'entregador'};

/* Usuários de filial: usuário -> nome da filial (a ordem daqui é a ordem na tela) */
export const USUARIOS_FILIAL={
  matriz:'Setta 1 Matriz',
  conteudo:'Setta 3 Conteúdo',
  centro:'Setta 4 Centro',
  piraja:'Setta 5 Pirajá'
};
export const FILIAIS=Object.values(USUARIOS_FILIAL);

/* Texto da etiqueta no menu lateral para cada papel (filial mostra o nome da filial) */
export const ROTULO_PAPEL={admin:'Administrador',separador:'Separação',entregador:'Entregador'};

/* Nome usado na saudação "Bom dia, ...!" para cada usuário (filial usa o nome da filial) */
export const SAUDACAO={admin:'Igor',hebert:'Hebert',separador:'equipe de Separação',entregador:'Entregador'};

/* Pessoa a quem a etapa "NF" é atribuída no relatório */
export const RESP_NF='Igor';
/* Pessoas que podem emitir NF (a primeira já aparece escolhida na tela) */
export const EMISSORES_NF=['Igor','Hebert'];

/* ---------- 3. Listas de nomes (use ordem alfabética) ---------- */
export const SEPS=['Abel','Auricelia','Caio','Italu','Junior','Pedro','Tarciano','Wesley'];
export const EQUIPE=['Abel','Auricelia','Caio','Edmilson','Hebert','Igor','Italu','Junior','Maycon','Osmar','Pedro','Sandra','Tarciano','Wesley'];

/* ---------- 4. Etapas ----------
   Os códigos (separacao, conferido...) são gravados no banco: NÃO mude os códigos,
   só os textos que aparecem na tela. */
export const ST={separacao:'Em Separação',conferido:'Aguardando Conferência',nf:'Aguardando NF',aguardando:'Aguardando Entrega',conferencia:'Conferência de Entrega',correcao:'Precisa de Correção',finalizado:'Finalizados'};
export const BTN=[['separacao','Em separação'],['conferido','Aguardando conferência'],['nf','Aguardando NF'],['aguardando','Aguardando entrega'],['conferencia','Entregue']];
export const NOMES={andamento:'Em andamento',relatorio:'Relatório'};
export const ETAPAS=['separacao','conferido','nf','aguardando','conferencia','finalizado'];

/* ---------- 5. Cores de cada etapa ---------- */
export const COR={separacao:'#2563eb',conferido:'#7c3aed',nf:'#d97706',aguardando:'#ea580c',conferencia:'#0d9488',correcao:'#dc2626',finalizado:'#16a34a',andamento:'#1d4ed8'};

/* ---------- 6. Aviso de pedido parado ----------
   [horas para ficar amarelo, horas para ficar vermelho] em cada etapa */
export const LIMITE={separacao:[2,6],conferido:[1,4],nf:[1,4],aguardando:[8,24],conferencia:[8,24],correcao:[24,72]};
