# Lampadaire Govee

Carte Lovelace pour piloter un lampadaire Govee Uplighter (H60B0 « Wave Lamp ») depuis Home Assistant, avec le même découpage que l'app Govee Home :

- allumage et luminosité générale ;
- les trois zones Ondulante, Latérale et Inférieure, deux au plus à la fois comme sur la lampe ;
- **Ondulante** : couleurs de base, couleur libre, température de blanc ;
- **Latérale** : anneau de 8 segments, sélection segment par segment (« Tout sélectionner », « Inverser la sélection ») puis couleur ;
- **Inférieure** : température de blanc ;
- **Scènes** : les scènes Govee avec recherche, et vos instantanés ;
- **Musique** : réaction au son, 8 effets, sensibilité.

Écrite pour l'Echo Show 8 1re génération : pas de dépendance, pas d'animation permanente, redessin seulement quand une entité du lampadaire change.

## Prérequis

L'intégration [lasswellt/govee-homeassistant](https://github.com/lasswellt/govee-homeassistant) avec une clé API Govee. La carte utilise ses entités `light.<lampe>`, `switch.<lampe>_{ripple,side,bottom}_light`, `select.<lampe>_scene`, `select.<lampe>_snapshot`, `switch.<lampe>_music_mode`, `select.<lampe>_music_mode`, `number.<lampe>_music_sensitivity` et l'action `govee.set_segment_color`.

## Installation

HACS → menu ⋮ → Dépôts personnalisés → ce dépôt, catégorie « Dashboard », puis Télécharger. HACS ajoute la ressource `/hacsfiles/ha-govee-lamp-card/govee-lamp-card.js`.

## Configuration

```yaml
type: custom:govee-lamp-card
entity: light.salon_wave_lamp
title: Lampadaire        # facultatif, nom de l'entité par défaut
```

## Ce que la lampe fait vraiment (constaté sur le H60B0)

- Une couleur colore l'ondulation **et** l'anneau latéral ; la lampe du bas reste blanche.
- Un blanc (température) s'applique à l'ondulation et au bas.
- Les segments ne colorent que l'anneau latéral : choisir la couleur de l'ondulation d'abord, puis celle de l'anneau.
- Le débit des ondulations n'existe pas dans l'API Govee : il reste réglable seulement dans l'app.

## Limite

Govee ne renvoie ni l'état des zones ni la couleur des segments à une clé API seule : la carte affiche la dernière commande envoyée depuis Home Assistant. Après un réglage fait dans l'app Govee, refaire le réglage voulu depuis la carte pour qu'elle soit de nouveau à jour. Les couleurs de l'anneau sont mémorisées par navigateur.
