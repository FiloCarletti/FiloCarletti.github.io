-- Pasti: significato di alcune colonne (letto da chi registra i pasti).
comment on column public.pasti_pasti.zuccheri_g is 'Zuccheri aggiunti (liberi), esclusi quelli naturali di frutta, verdura e latte. Stima.';
comment on column public.pasti_pasti.gruppi is 'Grammi nel piatto (cotti) per gruppo: verdura, frutta, legumi, cereali_integrali, cereali_raffinati, patate, carne_bianca, carne_rossa (anche maiale), carne_processata, pesce, uova, latticini, formaggi, frutta_secca, dolci';
comment on column public.pasti_pasti.punteggio is 'Qualità complessiva del pasto, 1-10';
comment on column public.pasti_obiettivi.zuccheri_max_g is 'Limite di zuccheri aggiunti al giorno';
