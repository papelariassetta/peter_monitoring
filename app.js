/* ==================================================================
   app.js — lógica do sistema (Monitoramento de Pedidos Setta)
   Nomes, filiais, usuários, cores e tempos de aviso ficam no config.js.
   Se mudar o número da versão do config.js aqui embaixo (?v=1), mude
   também no index.html.
   ================================================================== */
import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,collection,query,where,onSnapshot,doc,setDoc,deleteDoc} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {firebaseConfig,DOMINIO as DOM,PAPEIS,USUARIOS_FILIAL as MAP,FILIAIS,ROTULO_PAPEL,SAUDACAO,RESP_NF,EMISSORES_NF,SEPS,EQUIPE,ST,BTN,NOMES,ETAPAS,COR,LIMITE} from "./config.js?v=2";

/* ============ ESTADO DA TELA ============ */
var orders={},tab='novo',filtro='todas',pending=false,mesSel=null,confirmDel=null,editing=null,sinal='+',tipo='NF',draft={num:'',filial:FILIAIS[0],st:'separacao',sep:'',sepo:'',foco:false};
var busca='',recentes=[];
var PRIO={conferencia:0,aguardando:1,nf:2,conferido:3,separacao:4,correcao:5};

/* ============ TEMPOS E AVISOS ============ */
function horas(o){return (Date.now()-(o.atualizado||o.criado||Date.now()))/36e5}
function atraso(o){var L=LIMITE[o.status];if(!L)return 0;var h=horas(o);return h>=L[1]?2:h>=L[0]?1:0}
function idade(o){var h=horas(o);return h<1?'há '+Math.max(1,Math.round(h*60))+' min':h<24?'há '+Math.floor(h)+' h':'há '+Math.floor(h/24)+' d'}
function dur(o){if(!o.criado||!o.finalizadoEm)return '';var m=Math.round((o.finalizadoEm-o.criado)/6e4);if(m<60)return m+' min';var h=Math.floor(m/60);if(h<24)return h+' h '+('0'+(m%60)).slice(-2)+' min';var d=Math.floor(h/24);return d+' d '+(h%24)+' h'}

/* ============ REGRAS DE TELA POR PAPEL ============ */
function naAba(o,k){return k==='andamento'?o.status!=='finalizado':o.status===k}
function minhaAcao(o){return isFilial()&&(o.status==='aguardando'||o.status==='conferencia')}
function aviso(o){if(!minhaAcao(o))return '';var t=o.status==='aguardando'?['📦','Seu pedido chegou?','Toque em “Recebi o pedido” quando ele chegar.']:['🔍','Hora de conferir!','Veja se está tudo certo e finalize a conferência.'];return '<div class="avisoacao"><span class="ic">'+t[0]+'</span><div>'+t[1]+'<small>'+t[2]+'</small></div></div>'}
function progresso(o){var i=o.status==='correcao'?4:ETAPAS.indexOf(o.status);return '<div class="prog">'+ETAPAS.map(function(k,n){return '<span style="background:'+(n<=i?COR[o.status]:'var(--bd)')+'"></span>'}).join('')+'</div>'}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.className='s';setTimeout(function(){t.className=''},2400)}
function fmt(t){return t?new Date(t).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):''}
function fmtQ(q){q=+q;return '<span class="'+(q<0?'bad':'okc')+'">'+(q<0?'−':'+')+Math.abs(q)+' un.</span>'}
function btns(){return isSeparador()?BTN.slice(0,4):BTN}
function tabs(){if(isEntregador())return['aguardando'];if(isFilial())return['andamento','finalizado'];if(isSeparador())return['separacao','conferido','nf','aguardando'];var t=['separacao','conferido','nf','aguardando','conferencia'];if(isAdmin())t.push('correcao');t.push('finalizado');if(isAdmin())t.push('relatorio');return t}
function list(st){return Object.values(orders).filter(function(o){return naAba(o,st)&&(filtro==='todas'||o.filial===filtro)}).sort(function(a,b){return (st==='andamento'?(PRIO[a.status]-PRIO[b.status]):0)||((b.atualizado||0)-(a.atualizado||0))})}
function count(st){return Object.values(orders).filter(function(o){return naAba(o,st)}).length}

/* ============ GRAVAR NO BANCO ============ */
function save(id,patch){
  var o=Object.assign({},orders[id]||{},patch,{id:id,atualizado:Date.now()});
  orders[id]=o;render();
  setDoc(doc(fdb,'pedidos_setta',id),o).catch(function(){toast('Sem permissão para salvar')});
}
function removeOrder(id){
  delete orders[id];confirmDel=null;render();
  deleteDoc(doc(fdb,'pedidos_setta',id)).catch(function(){toast('Sem permissão para excluir')});
}

/* ============ PEÇAS DE FORMULÁRIO ============ */
function nameSel(cls,list,label){return '<label>'+label+'</label><select class="'+cls+'" data-out="1"><option value="">Selecione…</option>'+list.map(function(n){return '<option>'+n+'</option>'}).join('')+'<option value="__outro">Outro</option></select><input class="'+cls+'o" placeholder="Nome" style="display:none;margin-top:6px">'}
function nameVal(c,cls){var s=c.querySelector('.'+cls);if(!s)return '';return s.value==='__outro'?c.querySelector('.'+cls+'o').value.trim():s.value}
function collect(c){var p={},ob=c.querySelector('.ob'),ce=c.querySelector('.ce');if(ob)p.obs=ob.value.trim();if(ce)p.conferiuEntrega=ce.value.trim();return p}
function saveDraft(c){var n=c.querySelector('#num');if(n)draft.num=n.value;var s=c.querySelector('.nsep');if(s){draft.sep=s.value;var so=c.querySelector('.nsepo');draft.sepo=so?so.value:''}}

/* ============ CARTÃO DO PEDIDO ============ */
function infoLine(o){var p=[];
  if(o.separador)p.push('Separador: <b>'+esc(o.separador)+'</b>');
  if(o.volumes)p.push('Volumes: <b>'+esc(o.volumes)+'</b>');
  if(o.conferiu)p.push('Conferiu: <b>'+esc(o.conferiu)+'</b>');
  if(o.embalou)p.push('Embalou: <b>'+esc(o.embalou)+'</b>');
  if(o.nfNumero)p.push('NF: <b>'+esc(o.nfNumero)+'</b>'+(o.nfPor?' (por '+esc(o.nfPor)+')':''));
  if(o.volRecebidos!==undefined&&o.volRecebidos!=='')p.push('Volumes recebidos: <b>'+esc(o.volRecebidos)+'</b>');
  if(o.conferiuEntrega)p.push('Conf. de entrega: <b>'+esc(o.conferiuEntrega)+'</b>');
  return p.length?'<div class="mut" style="margin-bottom:6px">'+p.join(' · ')+'</div>':''}
function itensHtml(o,del){return (o.itens||[]).map(function(i,n){return '<div class="item"><span>'+(i.tipo?'<b>'+esc(i.tipo)+'</b> · ':'')+'Produto '+esc(i.produto)+' — '+fmtQ(i.qtd)+'</span>'+(del?'<button data-a="del" data-v="'+n+'">✕</button>':'')+'</div>'}).join('')}
function confEntrega(o){
  var h='<div class="escolha"><button class="ok'+(!o.correcao?' on':'')+'" data-a="corr" data-v="0">✅ Está tudo certo</button><button class="nok'+(o.correcao?' on':'')+'" data-a="corr" data-v="1">⚠️ Tem algo errado</button></div>';
  if(o.correcao){
    h+=itensHtml(o,true);
    h+='<div class="row sg"><button data-a="tipo" data-v="NF" class="'+(tipo==='NF'?'on':'')+'">NF</button><button data-a="tipo" data-v="Pedido" class="'+(tipo==='Pedido'?'on':'')+'">Pedido</button></div>';
    h+='<div class="row sg"><button data-a="sinal" data-v="-" class="'+(sinal==='-'?'on':'')+'">− Menos</button><button data-a="sinal" data-v="+" class="'+(sinal==='+'?'on':'')+'">+ Mais</button></div>';
    h+='<div class="add"><input class="p" placeholder="Nº do produto"><input class="q" type="number" min="1" placeholder="Qtd"><button data-a="item">Adicionar</button></div>';
    h+='<label>Observação (o que precisa ser feito)</label><textarea class="ob" rows="3">'+esc(o.obs||'')+'</textarea>';
  }
  return h+'<div style="margin-top:12px"><button class="fin big" data-a="finent">🏁 Finalizar conferência</button></div>';
}
function actions(o){
  var s=o.status,ad=isAdmin(),sp=isSeparador(),fi=isFilial();
  if(s==='separacao'&&(ad||sp))return '<button class="fin" data-a="finsep">Finalizada a separação</button>';
  if(s==='conferido'&&(ad||sp))return '<div style="max-width:160px"><label>Volumes</label><input class="vol" type="number" min="1" value="'+esc(o.volumes||'')+'"></div>'+nameSel('cf',EQUIPE,'Conferido por:')+nameSel('em',EQUIPE,'Embalado por:')+'<div style="margin-top:12px"><button class="fin" data-a="finconf">Finalizada a conferência</button></div>';
  if(s==='nf'&&ad)return '<div style="max-width:220px"><label>Número da NF</label><input class="nfn" inputmode="numeric" value="'+esc(o.nfNumero||'')+'"><label>NF emitida por:</label><select class="nfp" data-out="1">'+EMISSORES_NF.map(function(n){return '<option'+(n===(o.nfPor||EMISSORES_NF[0])?' selected':'')+'>'+n+'</option>'}).join('')+'<option value="__outro">Outro</option></select><input class="nfpo" placeholder="Nome" style="display:none;margin-top:6px"></div><div style="margin-top:12px"><button class="fin" data-a="finnf">NF emitida</button></div>';
  if(s==='aguardando'&&(ad||fi))return '<div style="margin-top:4px"><button class="fin big" data-a="entregue">✅ Recebi o pedido</button></div>';
  if(s==='conferencia'&&(ad||fi))return confEntrega(o);
  if(s==='correcao'&&ad)return '<button class="fin" data-a="aprovar">Aprovar correção e finalizar</button>';
  return '';
}
function editForm(o){
  function opt(a,v,l){return '<option value="'+esc(a)+'"'+(a===v?' selected':'')+'>'+esc(l||a)+'</option>'}
  var h='<div class="row"><div style="flex:1;min-width:130px"><label>Número</label><input class="e_numero" value="'+esc(o.numero)+'"></div>'+
   '<div style="flex:1;min-width:160px"><label>Filial</label><select class="e_filial">'+FILIAIS.map(function(x){return opt(x,o.filial)}).join('')+'</select></div>'+
   '<div style="flex:1;min-width:170px"><label>Status</label><select class="e_status">'+Object.keys(ST).map(function(k){return opt(k,o.status,ST[k])}).join('')+'</select></div></div>';
  [['separador','Separador'],['volumes','Volumes'],['conferiu','Conferido por'],['embalou','Embalado por'],['nfNumero','Número da NF'],['nfPor','NF emitida por'],['volRecebidos','Volumes recebidos'],['conferiuEntrega','Conferência de entrega por']].forEach(function(x){h+='<label>'+x[1]+'</label><input class="e_'+x[0]+'" value="'+esc(o[x[0]])+'">'});
  h+='<label>Precisa de correção?</label><select class="e_correcao">'+opt('0',o.correcao?'1':'0','Não')+opt('1',o.correcao?'1':'0','Sim')+'</select>';
  h+=itensHtml(o,true)+'<label>Observação</label><textarea class="e_obs" rows="3">'+esc(o.obs||'')+'</textarea>';
  return h+'<div class="row" style="margin-top:12px"><button class="fin" data-a="esalvar">Salvar alterações</button><button data-a="ecancelar">Cancelar</button></div>';
}
function card(o){
  var ed=isAdmin()&&editing===o.id;
  var cor=COR[o.status]||'var(--bd)',at=atraso(o);
  var h='<div class="card'+(minhaAcao(o)?' acao':'')+'" data-id="'+esc(o.id)+'" style="--wc:'+cor+';border-left:5px solid '+cor+'">'+aviso(o)+'<div class="top"><div><span class="num">Pedido '+esc(o.numero)+'</span><span class="tag">'+esc(o.filial)+'</span><div class="mut">'+(o.status==='finalizado'?'✔ Finalizado '+fmt(o.finalizadoEm)+(dur(o)?' · ⏱ Tempo total: <b>'+dur(o)+'</b>':''):'Atualizado '+fmt(o.atualizado)+(at?' · <span style="color:var('+(at===2?'--bad':'--warn')+');font-weight:600">⏱ '+idade(o)+' nesta etapa</span>':' · '+idade(o)))+'</div></div><span class="pill" style="background:'+cor+'">'+esc(ST[o.status]||o.status)+'</span></div>'+progresso(o);
  if(ed)return h+editForm(o)+'</div>';
  h+=infoLine(o);
  if(o.status==='finalizado'||o.status==='correcao'){h+=(o.correcao?'<div class="bad">Houve correção:</div>':'<div class="mut">Sem correções.</div>')+itensHtml(o,false)+(o.obs?'<div style="margin:6px 0"><span class="mut">Observação:</span> '+esc(o.obs)+'</div>':'')}
  var a=actions(o);
  h+=a||(o.status==='finalizado'?'':'<div class="mut" style="margin-top:8px">Somente consulta nesta etapa.</div>');
  if(isAdmin())h+='<div class="row" style="margin-top:12px"><button data-a="editar">Editar pedido</button>'+(confirmDel===o.id?'<span class="bad">Excluir este pedido?</span><button class="dangerx" data-a="excluir-sim">Sim, excluir</button><button data-a="excluir-nao">Cancelar</button>':'<button class="danger" data-a="excluir">Excluir pedido</button>')+'</div>';
  return h+'</div>';
}

/* ============ RELATÓRIO E PDF ============ */
function carregaScript(src){return new Promise(function(ok,erro){var s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=function(){erro(new Error('falha ao carregar '+src))};document.head.appendChild(s)})}
function imgDataUrl(src){return fetch(src).then(function(r){if(!r.ok)throw new Error('imagem');return r.blob()}).then(function(b){return new Promise(function(ok,erro){var f=new FileReader();f.onload=function(){ok(f.result)};f.onerror=erro;f.readAsDataURL(b)})})}
function pdfTxt(s){return String(s||'').replace(/→/g,'->').replace(/[−–—]/g,'-').replace(/[^\u0020-\u00ff]/g,'').replace(/\s+/g,' ').trim()}
async function baixarPdf(){
  var tb=document.querySelector('#main table');
  if(!tb){toast('Não há dados para gerar o PDF');return}
  toast('Gerando PDF…');
  try{
    if(!window.jspdf)await carregaScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    if(!window.jspdf.jsPDF.API.autoTable)await carregaScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
    var d=new window.jspdf.jsPDF({orientation:'landscape',unit:'pt',format:'a4'}),W=d.internal.pageSize.getWidth(),H=d.internal.pageSize.getHeight();
    var sel=document.querySelector('#main select.mes'),per=pdfTxt(sel.options[sel.selectedIndex].text).replace(' (atual)','');
    d.setFillColor(0,92,168);d.rect(0,0,W,66,'F');d.setFillColor(255,248,11);d.rect(0,66,W,4,'F');
    try{var lg=await imgDataUrl('logo.png');d.setFillColor(23,25,29);d.roundedRect(W-176,9,144,48,6,6,'F');d.addImage(lg,'PNG',W-170,12,132,46)}catch(e){d.setFillColor(0,92,168);d.rect(W-180,4,160,58,'F')}
    d.setTextColor(255,255,255);d.setFont('helvetica','bold');d.setFontSize(18);d.text('Relatório de Pedidos',32,30);
    d.setFont('helvetica','normal');d.setFontSize(11);d.setTextColor(255,248,11);d.text('Período: '+per+'   |   Gerado em '+new Date().toLocaleString('pt-BR'),32,50);
    var y=92;d.setTextColor(30,30,30);d.setFontSize(11);
    [].slice.call(document.querySelectorAll('#main > .card')).filter(function(c){return !c.querySelector('select')&&!c.querySelector('table')}).forEach(function(c){var t=d.splitTextToSize(pdfTxt(c.textContent),W-64);d.text(t,32,y);y+=t.length*14+4});
    d.autoTable({html:tb,startY:y+4,margin:{left:32,right:32,bottom:36},theme:'grid',styles:{font:'helvetica',fontSize:9,cellPadding:4},headStyles:{fillColor:[0,92,168],textColor:255},alternateRowStyles:{fillColor:[240,246,252]},
      didParseCell:function(h){if(h.section==='body'){var el=h.cell.raw;if(el&&el.classList&&(el.classList.contains('bad')||el.querySelector('.bad'))){h.cell.styles.textColor=[185,28,28];h.cell.styles.fontStyle='bold'}}}});
    var fy=d.lastAutoTable.finalY+16,nt=document.querySelector('#main > .mut');
    if(nt){var tx=d.splitTextToSize(pdfTxt(nt.textContent),W-64);if(fy+tx.length*10>H-30){d.addPage();fy=40}d.setFontSize(8);d.setTextColor(90,90,90);d.text(tx,32,fy)}
    var n=d.getNumberOfPages();for(var i=1;i<=n;i++){d.setPage(i);d.setFontSize(8);d.setTextColor(120,120,120);d.text('Página '+i+' de '+n,W-32,H-14,{align:'right'})}
    d.save('relatorio-setta-'+sel.value+'.pdf');toast('PDF gerado!');
  }catch(e){toast('Não foi possível gerar o PDF (verifique a internet)')}
}
function mesChave(o){var d=new Date(o.criado||o.atualizado||0);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)}
function mesNome(k){var x=k.split('-'),s=new Date(+x[0],+x[1]-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});return s.charAt(0).toUpperCase()+s.slice(1)}
function relatorio(){
  var P={},todos=Object.values(orders),comErro=0,atual=mesChave({criado:Date.now()}),ms={};
  ms[atual]=1;todos.forEach(function(o){ms[mesChave(o)]=1});
  var mk=mesSel||atual,all=mk==='todos'?todos:todos.filter(function(o){return mesChave(o)===mk});
  var sel='<div class="card row"><span class="mut">Mês:</span><select class="mes" style="max-width:240px">'+Object.keys(ms).sort().reverse().map(function(k){return '<option value="'+k+'"'+(k===mk?' selected':'')+'>'+mesNome(k)+(k===atual?' (atual)':'')+'</option>'}).join('')+'<option value="todos"'+(mk==='todos'?' selected':'')+'>Todos os meses</option></select><button class="fin" data-a="pdf" style="margin-left:auto">📄 Baixar PDF</button></div>';
  function pes(n){n=(n||'').trim();if(!n)return null;var k=n.toLowerCase();return P[k]||(P[k]={nome:n,sep:0,conf:0,emb:0,ent:0,nf:0,esep:0,econf:0,eemb:0,ped:{}})}
  function cel(n,e){return '<td><b>'+n+'</b>'+(e?' <span class="bad">· '+e+' erro'+(e>1?'s':'')+'</span>':'')+'</td>'}
  all.forEach(function(o){
    var err=o.correcao===true&&(o.status==='correcao'||o.status==='finalizado'),a;
    if(err)comErro++;
    if(a=pes(o.separador)){a.ped[o.id]=1;if(o.status!=='separacao'){a.sep++;if(err)a.esep++}}
    if(a=pes(o.conferiu)){a.ped[o.id]=1;a.conf++;if(err)a.econf++}
    if(a=pes(o.embalou)){a.ped[o.id]=1;a.emb++;if(err)a.eemb++}
    if(['aguardando','conferencia','correcao','finalizado'].indexOf(o.status)>=0&&(a=pes(o.nfPor||RESP_NF))){a.ped[o.id]=1;a.nf++}
  });
  var rows=Object.values(P).sort(function(a,b){return (Object.keys(b.ped).length-Object.keys(a.ped).length)||((b.sep+b.conf+b.emb+b.nf)-(a.sep+a.conf+a.emb+a.nf))});
  var h=sel+'<div class="card"><b>'+all.length+'</b> pedidos '+(mk==='todos'?'no total':'em '+mesNome(mk))+' · <span class="bad"><b>'+comErro+'</b> com correção</span></div>';
  var tt=all.filter(function(o){return o.status==='finalizado'&&o.criado&&o.finalizadoEm}).map(function(o){return o.finalizadoEm-o.criado});
  if(tt.length){var mm=function(ms){return dur({criado:0,finalizadoEm:ms})};h+='<div class="card">⏱ Tempo do pedido (cadastro → finalizado), em <b>'+tt.length+'</b> pedidos finalizados: média <b>'+mm(tt.reduce(function(a,b){return a+b},0)/tt.length)+'</b> · mais rápido <b>'+mm(Math.min.apply(null,tt))+'</b> · mais demorado <b>'+mm(Math.max.apply(null,tt))+'</b></div>'}
  if(!rows.length)return h+'<div class="empty">Ainda não há atividades registradas.</div>';
  h+='<div class="card" style="overflow-x:auto"><table><thead><tr><th>Pessoa</th><th>Separações</th><th>Conferências</th><th>Embalagens</th><th>NF</th><th>Total de participação</th><th>Total de erros</th><th>% de acerto</th><th>Pedidos em que atuou</th><th>% de participação</th></tr></thead><tbody>';
  rows.forEach(function(p){var te=p.esep+p.econf+p.eemb,tf=p.sep+p.conf+p.emb,pc=tf?(((tf-te)/tf)*100).toFixed(1).replace('.',',')+'%':'—',np=Object.keys(p.ped).length,pp=(np/all.length*100).toFixed(1).replace('.',',')+'%';
    h+='<tr><td><b>'+esc(p.nome)+'</b></td>'+cel(p.sep,p.esep)+cel(p.conf,p.econf)+cel(p.emb,p.eemb)+'<td><b>'+p.nf+'</b></td><td><b>'+(p.sep+p.conf+p.emb+p.nf)+'</b></td><td class="'+(te?'bad':'mut')+'"><b>'+te+'</b></td><td><b>'+pc+'</b></td><td><b>'+np+'</b> de '+all.length+'</td><td><b>'+pp+'</b></td></tr>'});
  return h+'</tbody></table></div><div class="mut">Erro = pedido que precisou de correção na conferência de entrega, contado para o separador, o conferente e o embalador daquele pedido. % de acerto = (separações + conferências + embalagens − erros) ÷ (separações + conferências + embalagens). % de participação = pedidos em que a pessoa aparece (separou, conferiu, embalou ou NF) ÷ total de pedidos do período; cada pedido conta uma vez por pessoa, mesmo que ela tenha feito mais de uma função nele. Cada pedido conta no mês em que foi cadastrado.</div>';
}

/* ============ SAUDAÇÃO E DESENHO DA TELA ============ */
function atualizaSaudacao(){
  if(!me)return;
  var h=new Date().getHours(),
      t=h>=5&&h<12?['☀️','Bom dia']:h>=12&&h<18?['🌤️','Boa tarde']:['🌙','Boa noite'],
      n=SAUDACAO[me.user]||me.filial||'',
      el=document.getElementById('saud');
  if(el)el.textContent=t[0]+' '+t[1]+', '+n+'!';
}
setInterval(atualizaSaudacao,60000);
function render(){atualizaSaudacao();
  var tl=tabs();
  if(tab==='novo'&&(isFilial()||isEntregador()))tab=tl[0];
  if(tab!=='novo'&&tl.indexOf(tab)<0)tab=tl[0];
  var nav=(isFilial()||isEntregador())?'':'<button data-a="tab" data-v="novo" class="'+(tab==='novo'?'on':'')+'">+ Novo pedido</button>';
  tl.forEach(function(k){var cr=COR[k],on=tab===k&&!busca,late=Object.values(orders).filter(function(o){return naAba(o,k)&&atraso(o)===2}).length,acn=isFilial()&&k==='andamento'?Object.values(orders).filter(minhaAcao).length:0;
    nav+='<button data-a="tab" data-v="'+k+'" class="'+(on?'on':'')+'"'+(on&&cr?' style="background:'+cr+';border-color:'+cr+';color:#fff"':'')+'>'+(k==='relatorio'?'Relatório':'<i class="dot" style="background:'+cr+'"></i>'+(ST[k]||NOMES[k])+'<span class="badge'+(late?' late':'')+'">'+count(k)+'</span>'+(acn?'<span class="badge acaoB">'+acn+' p/ você</span>':''))+'</button>'});
  document.getElementById('nav').innerHTML=nav;
  var m=document.getElementById('main');
  if(busca){var qq=busca.toLowerCase(),rs=Object.values(orders).filter(function(o){return (String(o.numero)+' '+String(o.nfNumero||'')).toLowerCase().indexOf(qq)>=0}).sort(function(a,b){return (b.atualizado||0)-(a.atualizado||0)});m.innerHTML='<div class="mut" style="margin-bottom:8px">Resultados da busca em todas as etapas: '+rs.length+'</div>'+(rs.length?rs.map(card).join(''):'<div class="empty">Nenhum pedido encontrado.</div>');return}
  if(tab==='novo'){
    var fo=FILIAIS.map(function(x){return '<button data-a="dfilial" data-v="'+esc(x)+'" class="'+(draft.filial===x?'on':'')+'">'+esc(x)+'</button>'}).join('');
    if(!seeAll())fo='<span class="chip">'+esc(me.filial)+'</span>';
    var so=btns().map(function(b){return '<button data-a="dst" data-v="'+b[0]+'" class="'+(draft.st===b[0]?'on':'')+'">'+b[1]+'</button>'}).join('');
    m.innerHTML='<div class="card"><label>Número do pedido</label><input id="num" inputmode="numeric" value="'+esc(draft.num)+'" placeholder="Ex.: 12345"><label>Filial</label><div class="row">'+fo+'</div><label>Status do pedido</label><div class="row">'+so+'</div>'+(draft.st==='separacao'?nameSel('nsep',SEPS,'Separador:'):'')+'<div style="margin-top:14px"><button class="fin" data-a="add">Processar pedido</button></div></div>'+(recentes.length?'<div class="card"><div class="mut" style="margin-bottom:4px">Últimos cadastrados</div>'+recentes.map(function(r){return '<div class="item"><span><b>'+esc(r.numero)+'</b> · '+esc(r.filial)+'</span><span class="mut">'+esc(r.etapa)+'</span></div>'}).join('')+'</div>':'');
    var s=m.querySelector('.nsep');
    if(s&&draft.sep){s.value=draft.sep;if(s.value==='__outro'){var oo=m.querySelector('.nsepo');oo.style.display='block';oo.value=draft.sepo}}
    if(draft.foco){draft.foco=false;var ni=m.querySelector('#num');if(ni)ni.focus()}
    return;
  }
  if(tab==='relatorio'){m.innerHTML=relatorio();return}
  var f=!seeAll()?'':'<div class="filter row"><span class="mut">Filial:</span>'+['todas'].concat(FILIAIS).map(function(x){return '<button data-a="filtro" data-v="'+esc(x)+'" class="'+(filtro===x?'on':'')+'">'+(x==='todas'?'Todas':esc(x))+'</button>'}).join('')+'</div>';
  var l=list(tab),rs0='';
  if(tab==='andamento'&&l.length)rs0='<div class="row" style="margin-bottom:10px">'+['conferencia','aguardando','nf','conferido','separacao'].map(function(k){var n=l.filter(function(o){return o.status===k}).length;return n?'<span class="chip"><i class="dot" style="background:'+COR[k]+'"></i>'+ST[k]+': <b>'+n+'</b></span>':''}).join('')+'</div>';
  if(tab==='andamento'&&isFilial()){var ac=l.filter(minhaAcao),ou=l.filter(function(o){return !minhaAcao(o)});m.innerHTML=rs0+(ac.length?'<div class="sec">🔔 Precisam da sua ação ('+ac.length+')</div>'+ac.map(card).join(''):'<div class="card">🎉 Nada pendente com você agora.</div>')+(ou.length?'<div class="sec">⏳ Acompanhando (a Setta está cuidando)</div>'+ou.map(card).join(''):'');return}
  m.innerHTML=f+rs0+(l.length?l.map(card).join(''):'<div class="empty">'+(tab==='andamento'?'Nenhum pedido em andamento.':'Nenhum pedido nesta aba.')+'</div>');
}

/* ============ CLIQUES E TECLAS ============ */
document.addEventListener('change',function(e){var s=e.target;if(s.classList&&s.classList.contains('mes')){mesSel=s.value;render();return}if(s.matches&&s.matches('select[data-out]')){var n=s.nextElementSibling;if(n)n.style.display=s.value==='__outro'?'block':'none'}});
document.addEventListener('click',function(e){
  var b=e.target.closest('[data-a]');if(!b)return;
  var a=b.dataset.a,v=b.dataset.v,c=b.closest('.card'),id=c&&c.dataset.id,o=id&&orders[id];
  if(a==='tab'){document.body.classList.remove('menu');tab=v;confirmDel=null;editing=null;mesSel=null;if(v==='novo')draft.foco=true;if(busca){busca='';document.getElementById('busca').value=''}render()}
  else if(a==='pdf'){baixarPdf()}
  else if(a==='filtro'){filtro=v;render()}
  else if(a==='dfilial'||a==='dst'){saveDraft(c);if(a==='dfilial')draft.filial=v;else draft.st=v;render()}
  else if(a==='add'){
    saveDraft(c);var n=draft.num.trim();
    if(!n){toast('Informe o número do pedido');return}
    if(Object.values(orders).some(function(x){return x.numero===n&&x.filial===draft.filial})){toast('Este pedido já existe nesta filial');return}
    var dest=draft.st,ord={numero:n,filial:draft.filial,status:dest,correcao:false,itens:[],criado:Date.now()};
    if(dest==='separacao'){var sp=nameVal(c,'nsep');if(!sp){toast('Informe o separador');return}ord.separador=sp}
    draft.num='';draft.foco=true;
    recentes.unshift({numero:n,filial:draft.filial,etapa:ST[dest]});recentes=recentes.slice(0,5);
    save('p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),ord);
    toast('Pedido '+n+' cadastrado em '+ST[dest]);
  }
  else if(a==='finsep'&&o){save(id,{status:'conferido'});toast('Enviado para Aguardando Conferência')}
  else if(a==='finconf'&&o){
    var vol=c.querySelector('.vol').value.trim(),cf=nameVal(c,'cf'),em=nameVal(c,'em');
    if(!vol||+vol<1){toast('Informe a quantidade de volumes');return}
    if(!cf){toast('Informe quem conferiu');return}
    if(!em){toast('Informe quem embalou');return}
    save(id,{volumes:vol,conferiu:cf,embalou:em,status:'nf'});toast('Enviado para Aguardando NF');
  }
  else if(a==='finnf'&&o){var nfn=c.querySelector('.nfn').value.trim(),nfp=nameVal(c,'nfp');if(!nfn){toast('Digite o número da NF');return}if(!nfp){toast('Informe quem emitiu a NF');return}save(id,{nfNumero:nfn,nfPor:nfp,status:'aguardando'});toast('Enviado para Aguardando Entrega')}
  else if(a==='entregue'&&o){
    save(id,{status:'conferencia'});toast('🎉 Recebimento confirmado! Agora confira o pedido.');
  }
  else if(a==='corr'&&o){save(id,Object.assign(collect(c),{correcao:v==='1'}))}
  else if(a==='tipo'){tipo=v;c.querySelectorAll('[data-a="tipo"]').forEach(function(x){x.classList.toggle('on',x.dataset.v===v)})}
  else if(a==='sinal'){sinal=v;c.querySelectorAll('[data-a="sinal"]').forEach(function(x){x.classList.toggle('on',x.dataset.v===v)})}
  else if(a==='item'&&o){
    var p=c.querySelector('.p').value.trim(),q=c.querySelector('.q').value.trim();
    if(!p||!q||+q<1){toast('Informe produto e quantidade');return}
    save(id,Object.assign(collect(c),{itens:(o.itens||[]).concat([{produto:p,tipo:tipo,qtd:(sinal==='-'?-1:1)*Math.abs(+q)}])}));
  }
  else if(a==='del'&&o){var it=(o.itens||[]).slice();it.splice(+v,1);save(id,Object.assign(collect(c),{itens:it}))}
  else if(a==='finent'&&o){
    var pp=collect(c);
    if(o.correcao&&!(o.itens||[]).length&&!pp.obs){toast('Informe o item ou a observação da correção');return}
    pp.status=o.correcao?'correcao':'finalizado';
    if(pp.status==='finalizado')pp.finalizadoEm=Date.now();
    save(id,pp);toast(o.correcao?'⚠️ Enviado para correção':'🎉 Pedido finalizado, obrigado!');
  }
  else if(a==='aprovar'&&o){save(id,{status:'finalizado',finalizadoEm:Date.now()});toast('Pedido finalizado')}
  else if(a==='editar'){editing=id;render()}
  else if(a==='ecancelar'){editing=null;render()}
  else if(a==='esalvar'&&o){
    var g=function(k){var el=c.querySelector('.e_'+k);return el?el.value.trim():''};
    var pe={numero:g('numero'),filial:g('filial'),status:g('status'),correcao:g('correcao')==='1',obs:g('obs')};
    ['separador','volumes','conferiu','embalou','nfNumero','nfPor','volRecebidos','conferiuEntrega'].forEach(function(k){pe[k]=g(k)});
    if(!pe.numero){toast('Informe o número do pedido');return}
    if(pe.status==='finalizado'&&!o.finalizadoEm)pe.finalizadoEm=Date.now();
    editing=null;save(id,pe);toast('Pedido atualizado');
  }
  else if(a==='excluir'&&o){confirmDel=id;render()}
  else if(a==='excluir-nao'){confirmDel=null;render()}
  else if(a==='excluir-sim'&&o){removeOrder(id);toast('Pedido excluído')}
});
document.addEventListener('focusout',function(){setTimeout(function(){if(pending&&!document.activeElement.matches('input,select,textarea')){pending=false;render()}},50)});
document.getElementById('busca').addEventListener('input',function(e){busca=e.target.value.trim();render()});
document.getElementById('menuBtn').addEventListener('click',function(){document.body.classList.toggle('menu')});
document.getElementById('scrim').addEventListener('click',function(){document.body.classList.remove('menu')});
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.id==='num'){var bt=document.querySelector('[data-a="add"]');if(bt)bt.click()}});

/* ============ LOGIN E LEITURA DO BANCO ============ */
var app=initializeApp(firebaseConfig),auth=getAuth(app),fdb=getFirestore(app);
var me=null,unsub=null,badMsg='';
function isAdmin(){return !!me&&me.role==='admin'}
function isSeparador(){return !!me&&me.role==='separador'}
function seeAll(){return isAdmin()||isSeparador()||isEntregador()}
function isFilial(){return !!me&&me.role==='filial'}
function isEntregador(){return !!me&&me.role==='entregador'}
function showLogin(msg){
  orders={};me=null;busca='';document.getElementById('busca').value='';
  document.getElementById('app').style.display='none';
  document.getElementById('login').style.display='block';
  document.getElementById('lerr').textContent=msg||'';
  document.getElementById('lp').value='';
}
document.getElementById('lform').addEventListener('submit',function(e){
  e.preventDefault();
  var u=document.getElementById('lu').value.trim().toLowerCase().split('@')[0],p=document.getElementById('lp').value;
  if(!u||!p)return;
  document.getElementById('lerr').textContent='';
  signInWithEmailAndPassword(auth,u+DOM,p).catch(function(){document.getElementById('lerr').textContent='Usuário ou senha incorretos.'});
});
document.getElementById('out').addEventListener('click',function(){signOut(auth)});
onAuthStateChanged(auth,function(user){
  if(unsub){unsub();unsub=null}
  if(!user){showLogin(badMsg);badMsg='';return}
  var un=(user.email||'').split('@')[0].toLowerCase();
  var role=PAPEIS[un]||(MAP[un]?'filial':null);
  if(!role){badMsg='Este usuário não tem acesso ao sistema.';signOut(auth);return}
  me={user:un,role:role,filial:MAP[un]||null};
  if(role==='filial')draft.filial=me.filial;
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('who').textContent=ROTULO_PAPEL[role]||me.filial;
  tab=role==='entregador'?'aguardando':(role==='filial'?'andamento':'novo');filtro='todas';render();
  var col=collection(fdb,'pedidos_setta');
  var q=role==='admin'?col:(role==='entregador'?query(col,where('status','==','aguardando')):role==='separador'?query(col,where('status','in',['separacao','conferido','nf','aguardando'])):query(col,where('filial','==',me.filial),where('status','in',['separacao','conferido','nf','aguardando','conferencia','finalizado'])));
  unsub=onSnapshot(q,function(s){
    var n={};s.forEach(function(d){n[d.id]=d.data()});orders=n;
    if(document.activeElement&&document.activeElement.id!=='busca'&&document.activeElement.matches('input,select,textarea')){pending=true}else render();
  },function(){toast('Sem permissão para ler os pedidos')});
});
