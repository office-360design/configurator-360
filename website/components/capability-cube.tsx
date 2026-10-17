"use client";

import { useState } from "react";
import type { Locale } from "../lib/i18n";

const capabilitiesByLocale = { en: [
  {
    id: "bom",
    code: "01",
    title: "Bill of Materials",
    short: "BOM",
    description: "The approved visual state resolves into an exact component structure: profiles, panels, glass, hardware, accessories and quantities ready for downstream work.",
    signal: "Geometry → components",
  },
  {
    id: "price",
    code: "02",
    title: "Dynamic Price Updating",
    short: "Price",
    description: "Dimensions, materials and options feed the commercial engine continuously. Every valid change produces an immediate, traceable price update.",
    signal: "Rules → live total",
  },
  {
    id: "custom",
    code: "03",
    title: "Vast Customization",
    short: "Options",
    description: "Deep option trees remain understandable because every choice is constrained by the product’s real compatibility, dimensional and manufacturing rules.",
    signal: "Choice → valid state",
  },
  {
    id: "render",
    code: "04",
    title: "Real-Time Rendering",
    short: "Render",
    description: "Browser-native 3D responds as the product changes, keeping geometry, finishes, assemblies and camera feedback synchronized without a separate render workflow.",
    signal: "Input → spatial proof",
  },
  {
    id: "light",
    code: "05",
    title: "Dynamic Day & Night Lighting",
    short: "Light",
    description: "Environmental states reveal how materials, openings and integrated lighting behave across daylight, shadow and night—not only inside a neutral studio scene.",
    signal: "Time → atmosphere",
  },
  {
    id: "ui",
    code: "06",
    title: "Clean Unified UI",
    short: "UI",
    description: "One coherent interaction language connects visual choices, engineering constraints, pricing and outputs so complex products never feel complex to operate.",
    signal: "Complexity → clarity",
  },
], ro: [
  { id: "bom", code: "01", title: "Listă de materiale", short: "BOM", description: "Configurația vizuală aprobată se transformă într-o structură exactă de componente: profile, panouri, sticlă, feronerie, accesorii și cantități pregătite pentru fluxurile operaționale.", signal: "Geometrie → componente" },
  { id: "price", code: "02", title: "Preț actualizat în timp real", short: "Preț", description: "Dimensiunile, materialele și opțiunile recalculează automat prețul. Fiecare modificare validă rămâne înregistrată în configurație.", signal: "Reguli → preț actualizat" },
  { id: "custom", code: "03", title: "Opțiuni adaptate produsului", short: "Opțiuni", description: "Fiecare alegere respectă compatibilitatea, dimensiunile și regulile reale de fabricație, chiar și pentru produse cu multe variante.", signal: "Alegere → configurație validă" },
  { id: "render", code: "04", title: "Randare în timp real", short: "Randare", description: "Modelul 3D din browser răspunde imediat și păstrează geometria, finisajele, ansamblurile și camera sincronizate.", signal: "Comandă → confirmare 3D" },
  { id: "light", code: "05", title: "Iluminare dinamică zi/noapte", short: "Lumină", description: "Condițiile de mediu arată cum se văd materialele, deschiderile și iluminatul integrat în lumină naturală, umbră și noapte, nu doar într-un studio neutru.", signal: "Timp → atmosferă" },
  { id: "ui", code: "06", title: "Interfață unitară și clară", short: "Interfață", description: "Un singur limbaj de interacțiune conectează alegerile vizuale, constrângerile tehnice, prețurile și rezultatele, astfel încât un produs complex să rămână simplu de operat.", signal: "Complexitate → claritate" },
], de: [
  { id: "bom", code: "01", title: "Stückliste", short: "BOM", description: "Der freigegebene visuelle Zustand wird zu einer exakten Komponentenstruktur aus Profilen, Paneelen, Glas, Beschlägen, Zubehör und Mengen—bereit für nachgelagerte Prozesse.", signal: "Geometrie → Komponenten" },
  { id: "price", code: "02", title: "Dynamische Preisaktualisierung", short: "Preis", description: "Maße, Materialien und Optionen speisen die kaufmännische Logik kontinuierlich. Jede gültige Änderung erzeugt sofort eine nachvollziehbare Preisaktualisierung.", signal: "Regeln → Live-Gesamtpreis" },
  { id: "custom", code: "03", title: "Umfangreiche Individualisierung", short: "Optionen", description: "Tiefe Optionsstrukturen bleiben verständlich, weil jede Auswahl durch reale Kompatibilitäts-, Maß- und Fertigungsregeln begrenzt wird.", signal: "Auswahl → gültiger Zustand" },
  { id: "render", code: "04", title: "Echtzeit-Rendering", short: "Rendering", description: "Browsernatives 3D reagiert unmittelbar auf Änderungen und hält Geometrie, Oberflächen, Baugruppen und Kamerafeedback ohne separaten Renderprozess synchron.", signal: "Eingabe → räumlicher Beleg" },
  { id: "light", code: "05", title: "Dynamisches Tag- und Nachtlicht", short: "Licht", description: "Umgebungszustände zeigen Materialien, Öffnungen und integrierte Beleuchtung bei Tageslicht, Schatten und Nacht—nicht ausschließlich in einer neutralen Studioszene.", signal: "Zeit → Atmosphäre" },
  { id: "ui", code: "06", title: "Klare, einheitliche Oberfläche", short: "UI", description: "Eine konsistente Interaktionssprache verbindet visuelle Auswahl, technische Vorgaben, Preis und Ausgabe, damit komplexe Produkte einfach zu bedienen bleiben.", signal: "Komplexität → Klarheit" },
], es: [
  { id: "bom", code: "01", title: "Lista de materiales", short: "BOM", description: "El estado visual aprobado se convierte en una estructura exacta de componentes: perfiles, paneles, vidrio, herrajes, accesorios y cantidades listos para los procesos posteriores.", signal: "Geometría → componentes" },
  { id: "price", code: "02", title: "Precio dinámico", short: "Precio", description: "Dimensiones, materiales y opciones alimentan el motor comercial de forma continua. Cada cambio válido genera una actualización de precio inmediata y trazable.", signal: "Reglas → total en vivo" },
  { id: "custom", code: "03", title: "Personalización amplia", short: "Opciones", description: "Los árboles de opciones profundos siguen siendo comprensibles porque cada elección está limitada por las reglas reales de compatibilidad, dimensiones y fabricación del producto.", signal: "Elección → estado válido" },
  { id: "render", code: "04", title: "Renderizado en tiempo real", short: "Render", description: "El 3D nativo del navegador responde a cada cambio del producto y mantiene sincronizados geometría, acabados, conjuntos y cámara sin un flujo de renderizado aparte.", signal: "Entrada → prueba espacial" },
  { id: "light", code: "05", title: "Iluminación dinámica día y noche", short: "Luz", description: "Los estados del entorno muestran cómo se comportan materiales, aberturas e iluminación integrada con luz diurna, sombra y de noche, no solo en un estudio neutro.", signal: "Tiempo → atmósfera" },
  { id: "ui", code: "06", title: "Interfaz limpia y unificada", short: "UI", description: "Un único lenguaje de interacción conecta elecciones visuales, restricciones técnicas, precios y resultados para que los productos complejos nunca resulten complejos de usar.", signal: "Complejidad → claridad" },
], fr: [
  { id: "bom", code: "01", title: "Nomenclature", short: "BOM", description: "L’état visuel validé se traduit en une structure exacte de composants : profilés, panneaux, vitrages, quincaillerie, accessoires et quantités prêts pour les équipes en aval.", signal: "Géométrie → composants" },
  { id: "price", code: "02", title: "Prix mis à jour en direct", short: "Prix", description: "Dimensions, matériaux et options alimentent en continu le moteur commercial. Chaque modification valide produit une mise à jour de prix immédiate et traçable.", signal: "Règles → total en direct" },
  { id: "custom", code: "03", title: "Personnalisation étendue", short: "Options", description: "Les arborescences d’options restent lisibles, car chaque choix est encadré par les règles réelles de compatibilité, de dimensions et de fabrication du produit.", signal: "Choix → état valide" },
  { id: "render", code: "04", title: "Rendu en temps réel", short: "Rendu", description: "La 3D native du navigateur réagit à chaque changement du produit et synchronise géométrie, finitions, assemblages et caméra sans chaîne de rendu séparée.", signal: "Saisie → preuve spatiale" },
  { id: "light", code: "05", title: "Éclairage dynamique jour et nuit", short: "Lumière", description: "Les états d’environnement montrent le comportement des matériaux, des ouvertures et de l’éclairage intégré en plein jour, à l’ombre et de nuit, pas seulement dans un studio neutre.", signal: "Heure → atmosphère" },
  { id: "ui", code: "06", title: "Interface claire et unifiée", short: "UI", description: "Un langage d’interaction cohérent relie choix visuels, contraintes techniques, prix et livrables, pour que les produits complexes restent simples à utiliser.", signal: "Complexité → clarté" },
], it: [
  { id: "bom", code: "01", title: "Distinta materiali", short: "BOM", description: "Lo stato visivo approvato diventa una struttura esatta di componenti: profili, pannelli, vetri, ferramenta, accessori e quantità pronti per i processi a valle.", signal: "Geometria → componenti" },
  { id: "price", code: "02", title: "Prezzo aggiornato in tempo reale", short: "Prezzo", description: "Dimensioni, materiali e opzioni alimentano costantemente il motore commerciale. Ogni modifica valida produce un aggiornamento di prezzo immediato e tracciabile.", signal: "Regole → totale live" },
  { id: "custom", code: "03", title: "Ampia personalizzazione", short: "Opzioni", description: "Alberi di opzioni profondi restano comprensibili perché ogni scelta è vincolata dalle reali regole di compatibilità, dimensionali e produttive del prodotto.", signal: "Scelta → stato valido" },
  { id: "render", code: "04", title: "Rendering in tempo reale", short: "Render", description: "Il 3D nativo del browser risponde a ogni modifica del prodotto e mantiene sincronizzati geometria, finiture, assiemi e camera senza un flusso di rendering separato.", signal: "Input → prova spaziale" },
  { id: "light", code: "05", title: "Luce dinamica giorno e notte", short: "Luce", description: "Gli stati ambientali mostrano come si comportano materiali, aperture e illuminazione integrata con luce diurna, ombra e di notte, non solo in uno studio neutro.", signal: "Tempo → atmosfera" },
  { id: "ui", code: "06", title: "Interfaccia pulita e unificata", short: "UI", description: "Un unico linguaggio di interazione collega scelte visive, vincoli tecnici, prezzi e output, così i prodotti complessi non risultano mai complessi da usare.", signal: "Complessità → chiarezza" },
]} as const satisfies Record<Locale, readonly unknown[]>;

type CubeCopy = { shared: string; core: string; titleA: string; titleB: string; intro: string; cube: string; select: string; show: string; face: string; signal: string };

const cubeCopy: Record<Locale, CubeCopy> = {
  en: { shared: "Shared platform DNA", core: "02 / Core system", titleA: "Six forces.", titleB: "One product state.", intro: "Every deployment is built on the same connected commercial and spatial foundation—even as the product category changes.", cube: "Interactive platform capability cube", select: "Select a capability", show: "Show", face: "ACTIVE FACE", signal: "Signal path" },
  ro: { shared: "Funcțiile comune ale platformei", core: "02 / Platformă", titleA: "Șase funcții.", titleB: "O singură configurație.", intro: "Fiecare implementare pornește de la aceeași bază 3D, tehnică și comercială, indiferent de produs.", cube: "Prezentarea interactivă a funcțiilor platformei", select: "Alege o funcție", show: "Afișează", face: "FUNCȚIE SELECTATĂ", signal: "Fluxul datelor" },
  de: { shared: "Gemeinsame Plattform-DNA", core: "02 / Kernsystem", titleA: "Sechs Kräfte.", titleB: "Ein Produktzustand.", intro: "Jede Implementierung basiert auf derselben verknüpften kaufmännischen und räumlichen Grundlage—unabhängig von der Produktkategorie.", cube: "Interaktiver Würfel der Plattformfunktionen", select: "Funktion auswählen", show: "Anzeigen", face: "AKTIVE FLÄCHE", signal: "Signalweg" },
  es: { shared: "ADN común de la plataforma", core: "02 / Sistema central", titleA: "Seis fuerzas.", titleB: "Un único estado de producto.", intro: "Cada implantación se construye sobre la misma base comercial y espacial conectada, aunque cambie la categoría de producto.", cube: "Cubo interactivo de funciones de la plataforma", select: "Seleccione una función", show: "Mostrar", face: "CARA ACTIVA", signal: "Flujo de señal" },
  fr: { shared: "ADN commun de la plateforme", core: "02 / Système central", titleA: "Six forces.", titleB: "Un seul état produit.", intro: "Chaque déploiement repose sur le même socle commercial et spatial connecté, quelle que soit la catégorie de produit.", cube: "Cube interactif des fonctions de la plateforme", select: "Sélectionnez une fonction", show: "Afficher", face: "FACE ACTIVE", signal: "Chemin du signal" },
  it: { shared: "DNA comune della piattaforma", core: "02 / Sistema centrale", titleA: "Sei forze.", titleB: "Un unico stato di prodotto.", intro: "Ogni implementazione si basa sulla stessa base commerciale e spaziale connessa, anche quando cambia la categoria di prodotto.", cube: "Cubo interattivo delle funzioni della piattaforma", select: "Selezioni una funzione", show: "Mostra", face: "FACCIA ATTIVA", signal: "Percorso del segnale" },
};

const featureCubeCopy: Record<Locale, { title: string; show: string }> = {
  en: { title: "Six system capabilities", show: "Show" },
  ro: { title: "Șase capabilități ale sistemului", show: "Afișează" },
  de: { title: "Sechs Systemfunktionen", show: "Anzeigen" },
  es: { title: "Seis funciones del sistema", show: "Mostrar" },
  fr: { title: "Six fonctions du système", show: "Afficher" },
  it: { title: "Sei funzioni del sistema", show: "Mostra" },
};

const rotations = [
  "rotateX(-16deg) rotateY(28deg)",
  "rotateX(-16deg) rotateY(-62deg)",
  "rotateX(-16deg) rotateY(-152deg)",
  "rotateX(-16deg) rotateY(118deg)",
  "rotateX(-68deg) rotateY(28deg)",
  "rotateX(112deg) rotateY(28deg)",
];

type Feature = { title: string; short: string; body: string };

function CubeObject({ active, labels, compact = false, onSelect, showLabel }: { active: number; labels: readonly string[]; compact?: boolean; onSelect: (index: number) => void; showLabel: string }) {
  return (
    <div className={compact ? "product-cube-stage" : "cube-stage"}>
      <div className="capability-cube" style={{ transform: rotations[active] }}>
        {labels.map((label, index) => (
          <button
            type="button"
            className={`cube-face cube-face-${index + 1} ${active === index ? "active" : ""}`}
            key={`${index}-${label}`}
            onClick={() => onSelect(index)}
            aria-label={`${showLabel} ${label}`}
          >
            <span>0{index + 1}</span>
            <strong>{compact ? label.split(/[ &]/)[0] : label}</strong>
            <i aria-hidden="true" />
          </button>
        ))}
      </div>
      {!compact && <><span className="cube-axis cube-axis-x">X</span><span className="cube-axis cube-axis-y">Y</span></>}
    </div>
  );
}

export function CapabilityCube({ detail = false, locale = "en" }: { detail?: boolean; locale?: Locale }) {
  const [active, setActive] = useState(0);
  const capabilities = capabilitiesByLocale[locale];
  const selected = capabilities[active];
  const copy = cubeCopy[locale];

  return (
    <section className={`capability-core ${detail ? "capability-core-detail" : ""}`} aria-labelledby={detail ? "shared-capabilities-title" : "platform-capabilities-title"}>
      <div className="capability-core-grid page-frame">
        <div className="capability-core-heading">
          <span className="mono-label">{detail ? copy.shared : copy.core}</span>
          <h2 id={detail ? "shared-capabilities-title" : "platform-capabilities-title"}>{copy.titleA}<br/>{copy.titleB}</h2>
          <p>{copy.intro}</p>
        </div>

        <div className="cube-console" aria-label={copy.cube}>
          <CubeObject active={active} labels={capabilities.map((item) => item.short)} onSelect={setActive} showLabel={copy.show} />
          <div className="cube-selector" aria-label={copy.select}>
            {capabilities.map((capability, index) => (
              <button type="button" key={capability.id} className={active === index ? "active" : ""} onClick={() => setActive(index)}>
                <span>{capability.code}</span>{capability.short}
              </button>
            ))}
          </div>
        </div>

        <div className="capability-readout" aria-live="polite">
          <div className="readout-index"><span>{selected.code}</span><i>{copy.face}</i></div>
          <h3>{selected.title}</h3>
          <p>{selected.description}</p>
          <div className="readout-signal"><span>{copy.signal}</span><b>{selected.signal}</b></div>
        </div>
      </div>
    </section>
  );
}

export function ProductFeatureCube({ features, label, locale = "en" }: { features: Feature[]; label: string; locale?: Locale }) {
  const [active, setActive] = useState(0);
  const items = features.slice(0, 6);
  const selected = items[active];

  const copy = featureCubeCopy[locale];
  return (
    <div className="product-feature-system" aria-label={`${label} capabilities`}>
      <span className="mono-label">{copy.title}</span>
      <CubeObject active={active} labels={items.map((item) => item.short)} compact onSelect={setActive} showLabel={copy.show} />
      <div className="product-feature-tabs">
        {items.map((feature, index) => (
          <button type="button" key={feature.title} className={active === index ? "active" : ""} onClick={() => setActive(index)}>
            <span>0{index + 1}</span>{feature.short}
          </button>
        ))}
      </div>
      <p className="product-feature-description"><b>{selected.title}</b>{selected.body}</p>
    </div>
  );
}
