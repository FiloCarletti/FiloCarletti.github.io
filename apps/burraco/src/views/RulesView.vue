<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="stack" style="gap: 14px">
    <RouterLink to="/" class="btn btn-ghost btn-sm" style="align-self: flex-start">← Gioca</RouterLink>
    <section class="card">
      <h2>Come si gioca</h2>
      <ul>
        <li>Due mazzi francesi con 4 jolly (108 carte). 11 carte a testa e due <strong>pozzetti</strong> da 11 carte.</li>
        <li>Nel tuo turno <strong>peschi</strong> una carta dal tallone <em>oppure</em> raccogli <strong>tutti</strong> gli scarti, poi cali o attacchi e infine <strong>scarti</strong> una carta.</li>
        <li><strong>Combinazioni</strong>: scale di almeno 3 carte consecutive dello stesso seme (l’asso va sotto il 2 o sopra il re) e tris di almeno 3 carte dello stesso valore.</li>
        <li><strong>Matte</strong>: jolly e pinelle (i 2). Al massimo una matta per combinazione; un 2 dello stesso seme al suo posto nella scala non è una matta.</li>
        <li>Puoi attaccare carte solo alle combinazioni della tua squadra. Se una carta naturale prende il posto della matta, la matta si sposta in fondo alla scala.</li>
        <li>Chi finisce le carte prende il <strong>pozzetto</strong> (uno per squadra): se le finisce calando continua subito, se le finisce scartando lo gioca dal turno dopo.</li>
        <li>Per <strong>chiudere</strong> la squadra deve aver preso il pozzetto e avere almeno un <strong>burraco</strong> (7 o più carte): si cala tutto e si scarta l’ultima carta, che non può essere una matta.</li>
        <li>Se raccogli una sola carta dagli scarti non puoi riscartarla subito. Se il tallone finisce, la mano si chiude senza chiusura.</li>
      </ul>
    </section>
    <section class="card">
      <h2>Punteggio</h2>
      <div class="table-wrap">
        <table class="table">
          <tbody>
            <tr><td>Jolly</td><td class="num">30</td></tr>
            <tr><td>Pinella (2)</td><td class="num">20</td></tr>
            <tr><td>Asso</td><td class="num">15</td></tr>
            <tr><td>Dall’8 al re</td><td class="num">10</td></tr>
            <tr><td>Dal 3 al 7</td><td class="num">5</td></tr>
            <tr><td>Burraco pulito (senza matte)</td><td class="num">+200</td></tr>
            <tr><td>Burraco sporco (con una matta)</td><td class="num">+100</td></tr>
            <tr><td>Chiusura</td><td class="num">+100</td></tr>
            <tr><td>Pozzetto non preso</td><td class="num">−100</td></tr>
          </tbody>
        </table>
      </div>
      <p class="muted small">
        Ogni mano: <strong>base</strong> (burraco, chiusura, pozzetto) + <strong>carte</strong> (valore delle carte calate meno quelle rimaste in mano).
        Vince chi supera per primo l’obiettivo (di solito 2005); se lo superano entrambe vince chi ha di più.
      </p>
    </section>
  </div>
</template>

<style scoped>
ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
.table td { padding: 6px 8px; }
</style>
