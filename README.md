# Lampadaire Govee

Carte Lovelace pour piloter un lampadaire Govee Uplighter (H60B0 « Wave Lamp ») depuis Home Assistant, avec le même découpage que l'app Govee Home :

- allumage et luminosité générale ;
- **ambiances** en un appui : Lecture, Chaleureux, Soirée, Cinéma, Océan, Aurore, Plein jour (remplaçables) ;
- les trois zones Ondulante, Latérale et Inférieure, deux au plus à la fois comme sur la lampe ;
- **Ondulante** : couleurs de base, couleur libre, blanc, luminosité, débit des ondulations ;
- **Latérale** : anneau de 8 segments, sélection segment par segment (« Tout sélectionner », « Inverser la sélection ») puis couleur ou blanc, luminosité ;
- **Inférieure** : blanc et luminosité, indépendants du plafond ;
- **Scènes** : les scènes Govee avec recherche, et vos instantanés ;
- **Musique** : réaction au son, 8 effets, sensibilité.

Écrite pour l'Echo Show 8 1re génération : pas de dépendance, pas d'animation permanente, redessin seulement quand une entité du lampadaire change.

## Prérequis

- [ha-govee-uplighter](https://github.com/Louis-hue-lang/ha-govee-uplighter) : commande locale zone par zone (blancs et couleurs séparés, anneau, débit). Obligatoire.
- [lasswellt/govee-homeassistant](https://github.com/lasswellt/govee-homeassistant) : scènes et musique, par le cloud Govee. Facultatif : sans lui, pas d'onglets Scènes et Musique.

## Installation

Marketplace / HACS → dépôts personnalisés → ce dépôt, catégorie « Dashboard », puis Télécharger.

## Configuration

```yaml
type: custom:govee-lamp-card
local: light.lampadaire          # lumière principale de Govee Uplighter (local)
entity: light.salon_wave_lamp    # facultatif : lumière de l'intégration Govee cloud (scènes, musique)
title: Lampadaire                # facultatif
presets:                         # facultatif : remplace les ambiances par défaut ([] pour aucune)
  - name: Lecture
    icon: mdi:book-open-variant
    ripple: false                # false = zone éteinte
    side: false
    lower: { kelvin: 4000, brightness: 100 }
  - name: Soirée
    icon: mdi:glass-wine
    ripple: { kelvin: 2700, brightness: 40 }
    side: { rgb: [255, 110, 20], brightness: 40 }
    lower: false
    flow: 1                      # débit des ondulations, 0 à 100
```

Deux zones allumées au plus par ambiance ; la lampe du bas n'accepte que `kelvin`.

## Ce que la lampe fait vraiment (constaté sur le H60B0)

- Par le cloud Govee, un blanc s'applique au plafond **et** au bas, et une couleur recolore aussi l'anneau : d'où la commande locale, zone par zone.
- Deux zones au plus ; la lampe du bas n'a que du blanc.
- Une teinte mélangée (orangé pâle…) se décompose en arc-en-ciel au plafond : pour un plafond chaud, utiliser le blanc.

## Limite

La lampe ne renvoie pas l'état de ses zones : la carte affiche le dernier réglage envoyé depuis Home Assistant. Après un réglage fait dans l'app Govee ou une scène, refaire le réglage voulu depuis la carte pour la recaler.
