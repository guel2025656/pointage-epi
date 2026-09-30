(function () {
  var state = { secteurs: [], acteurs: [], sitesIndex: {}, token: localStorage.getItem('epi_token') || null,
                admin: JSON.parse(localStorage.getItem('epi_admin') || 'null') };
  var params = new URLSearchParams(location.search);
  var urlSite = params.get('site');

  function todayStr(){ var d=new Date(); return d.toISOString().slice(0,10); }
  function nowTime(){ var d=new Date(); return d.toTimeString().slice(0,5); }

  function authHeaders(){
    var h = {'Content-Type':'application/json'};
    if(state.token) h['Authorization'] = 'Bearer '+state.token;
    return h;
  }
  async function apiGet(path){
    var res = await fetch(path, { headers: authHeaders() });
    if(!res.ok) throw await res.json().catch(function(){return {error:'Erreur réseau'};});
    return res.json();
  }
  async function apiSend(path, method, body){
    var res = await fetch(path, { method: method, headers: authHeaders(), body: JSON.stringify(body||{}) });
    var data = await res.json().catch(function(){return {};});
    if(!res.ok) throw data;
    return data;
  }

  // ---------- Tabs ----------
  document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click', function(){
      document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active');});
      document.querySelectorAll('.panel').forEach(function(x){x.classList.remove('active');});
      t.classList.add('active');
      document.getElementById('panel-'+t.dataset.tab).classList.add('active');
      if(t.dataset.tab==='dashboard' && state.token) loadDashboard();
      if(t.dataset.tab==='absences' && state.token) loadAbsences();
    });
  });

  // ---------- Offline queue ----------
  function getQueue(){ try{ return JSON.parse(localStorage.getItem('epi_queue')||'[]'); }catch(e){ return []; } }
  function setQueue(q){ localStorage.setItem('epi_queue', JSON.stringify(q)); renderQueue(); }
  function renderQueue(){
    var q = getQueue();
    var card = document.getElementById('queueCard');
    if(!q.length){ card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    document.getElementById('queueList').innerHTML = q.map(function(it){
      return '<div class="pill">'+it.type+' — '+it.date+' '+it.heure+'</div>';
    }).join('');
  }
  async function trySyncQueue(){
    if(!navigator.onLine) return;
    var q = getQueue();
    if(!q.length) return;
    var remaining = [];
    for(var i=0;i<q.length;i++){
      var it = q[i];
      try{
        await apiSend('/api/pointages/'+it.type, 'POST', {
          acteurId: it.acteurId, pin: it.pin, date: it.date, heure: it.heure,
          lat: it.lat, lng: it.lng, creeHorsLigne: true
        });
      }catch(e){ remaining.push(it); }
    }
    setQueue(remaining);
    if(remaining.length < q.length) renderMesPointages();
  }
  window.addEventListener('online', trySyncQueue);

  function getGeoloc(){
    return new Promise(function(resolve){
      if(!navigator.geolocation){ resolve({lat:null,lng:null}); return; }
      navigator.geolocation.getCurrentPosition(
        function(pos){ resolve({lat: Math.round(pos.coords.latitude*10000)/10000, lng: Math.round(pos.coords.longitude*10000)/10000}); },
        function(){ resolve({lat:null,lng:null}); },
        { timeout: 6000 }
      );
    });
  }

  // ---------- Selects ----------
  function fillSelect(id, items, placeholder){
    var sel = document.getElementById(id);
    var current = sel.value;
    sel.innerHTML = '<option value="">'+placeholder+'</option>' + items.map(function(i){
      return '<option value="'+i.id+'">'+i.nom+'</option>';
    }).join('');
    if(items.find(function(i){return i.id===current;})) sel.value = current;
  }

  async function loadSecteurs(){
    state.secteurs = await apiGet('/api/secteurs');
    fillSelect('p-secteur', state.secteurs, 'Tous les secteurs');
    fillSelect('d-secteur', state.secteurs, 'Tous');
    fillSelect('a-secteur', state.secteurs, 'Tous les secteurs');
    fillSelect('n-secteur', state.secteurs, 'Choisir');
    fillSelect('n-site-secteur', state.secteurs, 'Choisir');
  }
  async function loadSites(secteurId, targetId, placeholder){
    var sites = await apiGet('/api/sites'+(secteurId?('?secteurId='+secteurId):''));
    fillSelect(targetId, sites, placeholder);
    return sites;
  }
  async function loadActeurs(secteurId, siteId){
    var qs = [];
    if(secteurId) qs.push('secteurId='+secteurId);
    if(siteId) qs.push('siteId='+siteId);
    state.acteurs = await apiGet('/api/acteurs'+(qs.length?('?'+qs.join('&')):''));
    var sel = document.getElementById('p-acteur');
    sel.innerHTML = '<option value="">Sélectionnez votre nom</option>' + state.acteurs.map(function(a){
      return '<option value="'+a.id+'">'+a.nom+' — '+roleLabel(a.role)+'</option>';
    }).join('');
  }
  function roleLabel(r){
    return {ENSEIGNANT_ITINERANT:'Enseignant itinérant',VOLONTAIRE:'Volontaire',CANEF:'CANEF',CPPP:'CPPP',IEPP:'IEPP'}[r]||r;
  }

  document.getElementById('p-secteur').addEventListener('change', async function(){
    await loadSites(this.value, 'p-site', 'Tous les sites');
    await loadActeurs(this.value, document.getElementById('p-site').value);
  });
  document.getElementById('p-site').addEventListener('change', function(){
    loadActeurs(document.getElementById('p-secteur').value, this.value);
  });
  document.getElementById('a-secteur').addEventListener('change', async function(){
    var sites = await loadSites(this.value, 'a-acteur', 'Sélectionnez un acteur'); // temp, replaced below
    var acteurs = await apiGet('/api/acteurs'+(this.value?('?secteurId='+this.value):''));
    var sel = document.getElementById('a-acteur');
    sel.innerHTML = '<option value="">Sélectionnez un acteur</option>' + acteurs.map(function(a){
      return '<option value="'+a.id+'">'+a.nom+' — '+roleLabel(a.role)+'</option>';
    }).join('');
  });

  // ---------- PIN modal ----------
  var pendingAction = null;
  function openPinModal(acteur, type){
    pendingAction = { acteur: acteur, type: type };
    document.getElementById('pinModalActeur').textContent = acteur.nom+' — '+(type==='arrivee'?'Enregistrer mon arrivée':'Enregistrer mon départ');
    document.getElementById('pinInput').value = '';
    document.getElementById('pinModalStatus').innerHTML = '';
    document.getElementById('pinModal').classList.remove('hidden');
    document.getElementById('pinInput').focus();
  }
  function closePinModal(){ document.getElementById('pinModal').classList.add('hidden'); pendingAction = null; }
  document.getElementById('pinCancel').addEventListener('click', closePinModal);
  document.getElementById('pinConfirm').addEventListener('click', async function(){
    if(!pendingAction) return;
    var pin = document.getElementById('pinInput').value.trim();
    var statusEl = document.getElementById('pinModalStatus');
    if(!/^\d{4}$/.test(pin)){ statusEl.className='status err'; statusEl.textContent='Entrez les 4 chiffres de votre code.'; return; }
    statusEl.className='status info'; statusEl.textContent='Localisation en cours…';
    var geo = await getGeoloc();
    var acteur = pendingAction.acteur, type = pendingAction.type;
    var payload = { acteurId: acteur.id, pin: pin, date: todayStr(), heure: nowTime(), lat: geo.lat, lng: geo.lng };
    if(!navigator.onLine){
      var q = getQueue(); q.push(Object.assign({type:type}, payload)); setQueue(q);
      closePinModal();
      setPointageStatus('Pointage enregistré hors-ligne — sera synchronisé au retour du réseau.', 'warn');
      return;
    }
    try{
      await apiSend('/api/pointages/'+type, 'POST', payload);
      closePinModal();
      setPointageStatus((type==='arrivee'?'Arrivée':'Départ')+' enregistré(e) pour '+acteur.nom+' à '+payload.heure+'.', 'ok');
      renderMesPointages();
    }catch(e){
      if(e && e.error && /PIN/i.test(e.error)){
        statusEl.className='status err'; statusEl.textContent = e.error;
        return;
      }
      var q2 = getQueue(); q2.push(Object.assign({type:type}, payload)); setQueue(q2);
      closePinModal();
      setPointageStatus('Connexion instable — pointage mis en attente de synchronisation.', 'warn');
    }
  });

  function setPointageStatus(msg, cls){
    var el = document.getElementById('pointageStatus');
    el.className = 'status '+cls; el.textContent = msg;
  }
  function currentActeur(){
    var id = document.getElementById('p-acteur').value;
    return state.acteurs.find(function(a){return a.id===id;});
  }
  document.getElementById('btnArrivee').addEventListener('click', function(){
    var a = currentActeur();
    if(!a){ setPointageStatus('Sélectionnez votre nom avant de pointer.', 'err'); return; }
    openPinModal(a, 'arrivee');
  });
  document.getElementById('btnDepart').addEventListener('click', function(){
    var a = currentActeur();
    if(!a){ setPointageStatus('Sélectionnez votre nom avant de pointer.', 'err'); return; }
    openPinModal(a, 'depart');
  });
  document.getElementById('p-acteur').addEventListener('change', renderMesPointages);

  async function renderMesPointages(){
    var a = currentActeur();
    var el = document.getElementById('mesPointages');
    if(!a){ el.textContent = 'Sélectionnez votre nom pour voir votre historique.'; return; }
    try{
      var list = await apiGet('/api/pointages/mes-pointages?acteurId='+a.id);
      if(!list.length){ el.textContent = 'Aucun pointage enregistré pour le moment.'; return; }
      el.innerHTML = '<table><thead><tr><th>Date</th><th>Arrivée</th><th>Départ</th></tr></thead><tbody>' +
        list.map(function(p){
          return '<tr><td>'+p.date.slice(0,10)+'</td><td>'+(p.heureArrivee||'—')+'</td><td>'+(p.heureDepart||'—')+'</td></tr>';
        }).join('') + '</tbody></table>';
    }catch(e){ el.textContent = "Historique indisponible pour l'instant."; }
  }

  // ---------- Admin login ----------
  document.getElementById('btnLogin').addEventListener('click', async function(){
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var statusEl = document.getElementById('loginStatus');
    if(!email || !password){ statusEl.className='status err'; statusEl.textContent='Email et mot de passe requis.'; return; }
    try{
      var data = await apiSend('/api/auth/admin/login', 'POST', { email: email, password: password });
      state.token = data.token; state.admin = data.admin;
      localStorage.setItem('epi_token', data.token);
      localStorage.setItem('epi_admin', JSON.stringify(data.admin));
      applyAdminSession();
    }catch(e){
      statusEl.className='status err'; statusEl.textContent = (e && e.error) || 'Connexion impossible.';
    }
  });
  document.getElementById('btnLogout').addEventListener('click', function(){
    state.token = null; state.admin = null;
    localStorage.removeItem('epi_token'); localStorage.removeItem('epi_admin');
    applyAdminSession();
  });
  function applyAdminSession(){
    var logged = !!state.token;
    document.getElementById('loginCard').classList.toggle('hidden', logged);
    document.getElementById('adminContent').classList.toggle('hidden', !logged);
    document.getElementById('dashboardLoginPrompt').classList.toggle('hidden', logged);
    document.getElementById('dashboardContent').classList.toggle('hidden', !logged);
    if(logged){
      document.getElementById('sessionInfo').textContent = state.admin.nom+' — portée : '+(state.admin.portee==='NATIONALE'?'nationale':'secteur');
      loadDashboard(); loadAbsences(); loadQrCodes();
    }
  }

  // ---------- Dashboard ----------
  document.getElementById('d-secteur').addEventListener('change', async function(){
    await loadSites(this.value, 'd-site', 'Tous');
    loadDashboard();
  });
  document.getElementById('d-site').addEventListener('change', loadDashboard);
  document.getElementById('d-from').addEventListener('change', loadDashboard);
  document.getElementById('d-to').addEventListener('change', loadDashboard);

  async function loadDashboard(){
    if(!state.token) return;
    var secteurId = document.getElementById('d-secteur').value;
    var siteId = document.getElementById('d-site').value;
    var from = document.getElementById('d-from').value;
    var to = document.getElementById('d-to').value;
    var qs = [];
    if(secteurId) qs.push('secteurId='+secteurId);
    if(siteId) qs.push('siteId='+siteId);
    if(from) qs.push('from='+from);
    if(to) qs.push('to='+to);
    var query = qs.length ? ('?'+qs.join('&')) : '';

    try{
      var pointages = await apiGet('/api/pointages'+query);
      var taux = await apiGet('/api/reports/taux-presence'+(secteurId?('?secteurId='+secteurId):''));
      var alertes = await apiGet('/api/reports/alertes'+(secteurId?('?secteurId='+secteurId):''));

      document.getElementById('statCards').innerHTML = [
        statCard(taux.presents+'/'+taux.totalActeurs, "Présents aujourd'hui"),
        statCard(taux.taux+'%', 'Taux de présence du jour'),
        statCard(String(pointages.length), 'Pointages (période filtrée)'),
        statCard(String(alertes.length), 'Alertes actives')
      ].join('');

      var body = document.getElementById('pointagesBody');
      body.innerHTML = pointages.length ? pointages.slice(0,200).map(function(p){
        return '<tr><td>'+p.date.slice(0,10)+'</td><td>'+p.acteur.nom+'</td><td>'+roleLabel(p.acteur.role)+'</td><td>'+p.site.nom+'</td><td>'+(p.heureArrivee||'—')+'</td><td>'+(p.heureDepart||'—')+'</td></tr>';
      }).join('') : '<tr><td colspan="6" class="muted">Aucun pointage pour ces filtres.</td></tr>';

      var alertEl = document.getElementById('alertList');
      alertEl.innerHTML = alertes.length ? alertes.slice(0,30).map(function(al){
        var cls = al.joursActifs===0 ? 'err' : 'warn';
        return '<div style="margin-bottom:6px;"><span class="badge '+cls+'">'+(al.joursActifs===0?'Absent':'Retard')+'</span> '+al.nom+' ('+roleLabel(al.role)+', '+al.site+')</div>';
      }).join('') : '<span class="badge ok">Aucune alerte</span>';
    }catch(e){ /* session probablement expirée */ }
  }
  function statCard(n,l){ return '<div class="stat"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>'; }

  document.getElementById('btnExportCsv').addEventListener('click', function(){
    var secteurId = document.getElementById('d-secteur').value;
    var siteId = document.getElementById('d-site').value;
    var from = document.getElementById('d-from').value;
    var to = document.getElementById('d-to').value;
    var qs = [];
    if(secteurId) qs.push('secteurId='+secteurId);
    if(siteId) qs.push('siteId='+siteId);
    if(from) qs.push('from='+from);
    if(to) qs.push('to='+to);
    var url = '/api/reports/csv'+(qs.length?('?'+qs.join('&')):'');
    fetch(url, { headers: authHeaders() }).then(function(res){ return res.blob(); }).then(function(blob){
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'pointages_epi.csv'; a.click();
    });
  });

  // ---------- Absences ----------
  document.getElementById('btnAbsence').addEventListener('click', async function(){
    var acteurId = document.getElementById('a-acteur').value;
    var debut = document.getElementById('a-debut').value;
    var fin = document.getElementById('a-fin').value;
    var motif = document.getElementById('a-motif').value.trim();
    var statusEl = document.getElementById('absenceStatus');
    if(!acteurId || !debut || !motif){ statusEl.className='status err'; statusEl.textContent='Sélectionnez un acteur, une date et un motif.'; return; }
    try{
      await apiSend('/api/absences', 'POST', { acteurId: acteurId, dateDebut: debut, dateFin: fin||debut, motif: motif });
      statusEl.className='status ok'; statusEl.textContent='Demande enregistrée.';
      document.getElementById('a-motif').value='';
      if(state.token) loadAbsences();
    }catch(e){ statusEl.className='status err'; statusEl.textContent=(e&&e.error)||"Échec de l'enregistrement."; }
  });
  async function loadAbsences(){
    if(!state.token) return;
    try{
      var absences = await apiGet('/api/absences');
      var body = document.getElementById('absencesBody');
      body.innerHTML = absences.length ? absences.map(function(a){
        var cls = a.statut==='APPROUVEE'?'ok':(a.statut==='REFUSEE'?'err':'warn');
        var actions = a.statut==='EN_ATTENTE' ?
          '<button class="secondary small" data-approve="'+a.id+'">Approuver</button> <button class="secondary small" data-refuse="'+a.id+'">Refuser</button>' : '';
        return '<tr><td>'+a.acteur.nom+'</td><td>'+a.dateDebut.slice(0,10)+' → '+a.dateFin.slice(0,10)+'</td><td>'+a.motif+'</td><td><span class="badge '+cls+'">'+a.statut+'</span></td><td>'+actions+'</td></tr>';
      }).join('') : '<tr><td colspan="5" class="muted">Aucune demande.</td></tr>';
      body.querySelectorAll('[data-approve]').forEach(function(btn){
        btn.addEventListener('click', function(){ setAbsenceStatut(btn.dataset.approve, 'APPROUVEE'); });
      });
      body.querySelectorAll('[data-refuse]').forEach(function(btn){
        btn.addEventListener('click', function(){ setAbsenceStatut(btn.dataset.refuse, 'REFUSEE'); });
      });
    }catch(e){}
  }
  async function setAbsenceStatut(id, statut){
    try{ await apiSend('/api/absences/'+id, 'PATCH', { statut: statut }); loadAbsences(); }catch(e){}
  }

  // ---------- Admin: secteurs / sites / acteurs ----------
  document.getElementById('btnAddSecteur').addEventListener('click', async function(){
    var nom = document.getElementById('n-secteur-nom').value.trim();
    var statusEl = document.getElementById('addSecteurStatus');
    if(!nom){ statusEl.className='status err'; statusEl.textContent='Nom requis.'; return; }
    try{
      await apiSend('/api/secteurs', 'POST', { nom: nom });
      statusEl.className='status ok'; statusEl.textContent='Secteur ajouté.';
      document.getElementById('n-secteur-nom').value='';
      await loadSecteurs();
    }catch(e){ statusEl.className='status err'; statusEl.textContent=(e&&e.error)||'Échec.'; }
  });
  document.getElementById('n-site-secteur').addEventListener('change', function(){}); // placeholder for symmetry
  document.getElementById('btnAddSite').addEventListener('click', async function(){
    var secteurId = document.getElementById('n-site-secteur').value;
    var nom = document.getElementById('n-site-nom').value.trim();
    var statusEl = document.getElementById('addSiteStatus');
    if(!secteurId || !nom){ statusEl.className='status err'; statusEl.textContent='Secteur et nom requis.'; return; }
    try{
      await apiSend('/api/sites', 'POST', { nom: nom, secteurId: secteurId });
      statusEl.className='status ok'; statusEl.textContent='Site ajouté.';
      document.getElementById('n-site-nom').value='';
      loadQrCodes();
    }catch(e){ statusEl.className='status err'; statusEl.textContent=(e&&e.error)||'Échec.'; }
  });
  document.getElementById('n-secteur').addEventListener('change', async function(){
    await loadSites(this.value, 'n-site', 'Choisir');
  });
  document.getElementById('btnAddActeur').addEventListener('click', async function(){
    var nom = document.getElementById('n-nom').value.trim();
    var role = document.getElementById('n-role').value;
    var secteurId = document.getElementById('n-secteur').value;
    var siteId = document.getElementById('n-site').value;
    var pin = document.getElementById('n-pin').value.trim();
    var statusEl = document.getElementById('addActeurStatus');
    if(!nom || !secteurId || !siteId || !/^\d{4}$/.test(pin)){
      statusEl.className='status err'; statusEl.textContent='Nom, secteur, site et un PIN à 4 chiffres sont requis.'; return;
    }
    try{
      await apiSend('/api/acteurs', 'POST', { nom: nom, role: role, secteurId: secteurId, siteId: siteId, pin: pin });
      statusEl.className='status ok'; statusEl.textContent='Acteur ajouté.';
      document.getElementById('n-nom').value=''; document.getElementById('n-pin').value='';
    }catch(e){ statusEl.className='status err'; statusEl.textContent=(e&&e.error)||"Échec de l'ajout."; }
  });

  async function loadQrCodes(){
    if(!state.token) return;
    try{
      var sites = await apiGet('/api/qrcodes');
      var grid = document.getElementById('qrGrid');
      grid.innerHTML = sites.length ? sites.map(function(s){
        return '<div class="qritem"><img src="'+s.qrUrl+'" alt="QR '+s.nom+'"><div class="name">'+s.nom+'</div><div class="muted">'+s.secteur+'</div></div>';
      }).join('') : '<div class="muted">Aucun site pour le moment.</div>';
    }catch(e){}
  }

  // ---------- URL site preselection ----------
  function applyUrlSite(){
    if(!urlSite) return;
    var ctx = document.getElementById('siteContext');
    ctx.classList.remove('hidden');
    ctx.textContent = 'Site sélectionné via QR code. Choisissez votre nom pour pointer.';
  }

  // ---------- Init ----------
  async function init(){
    applyUrlSite();
    renderQueue();
    await loadSecteurs();
    if(urlSite){
      var sites = await apiGet('/api/sites');
      var site = sites.find(function(s){return s.id===urlSite;});
      if(site){
        document.getElementById('p-secteur').value = site.secteurId;
        await loadSites(site.secteurId, 'p-site', 'Tous les sites');
        document.getElementById('p-site').value = urlSite;
        await loadActeurs(site.secteurId, urlSite);
      }
    } else {
      await loadActeurs();
    }
    applyAdminSession();
    trySyncQueue();
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    }
  }
  init();
})();
