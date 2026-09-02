const routeIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="5" cy="18" r="2.25"></circle>
    <circle cx="19" cy="6" r="2.25"></circle>
    <path d="M7 17c4.5-1 3.5-7 8-9l1.8-.8"></path>
  </svg>`;

const pinIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path>
    <circle cx="12" cy="10" r="2.25"></circle>
  </svg>`;

const addIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14"></path>
  </svg>`;

const fitIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path>
  </svg>`;

function option(value, translationKey, selected = false) {
  return `<option value="${value}" data-gas-i18n="${translationKey}"${selected ? ' selected' : ''}></option>`;
}

function metric(id, labelKey, modifier = '') {
  return `
    <div class="gas-metric ${modifier}">
      <span data-gas-i18n="${labelKey}"></span>
      <strong id="${id}">—</strong>
    </div>`;
}

export function renderGasLayout(root) {
  root.innerHTML = `
    <main class="gas-app app-shell">
      <section class="gas-workspace" aria-label="Gas route workspace">
        <header class="gas-workspace__header">
          <div class="gas-title-lockup">
            <span class="gas-kicker" data-gas-i18n="app.eyebrow"></span>
            <div class="gas-title-row">
              <h1 data-gas-i18n="app.title"></h1>
              <span class="gas-status-chip gas-status-chip--prototype" data-gas-i18n="badge.prototype"></span>
            </div>
            <p data-gas-i18n="app.scope"></p>
          </div>
          <div class="gas-route-summary" aria-live="polite">
            <span data-gas-i18n="metric.routeLength"></span>
            <strong id="headerRouteLength">—</strong>
            <small id="headerSegmentCount">—</small>
          </div>
        </header>

        <section class="gas-map-card gas-surface-card" aria-labelledby="gasMapTitle">
          <div class="gas-card-heading gas-map-heading">
            <div>
              <h2 id="gasMapTitle" data-gas-i18n="map.title"></h2>
              <p data-gas-i18n="map.help"></p>
            </div>
            <span class="gas-screening-label" data-gas-i18n="map.screening"></span>
          </div>
          <div class="gas-map-stage">
            <div id="routeMap" class="gas-map" role="application" aria-label="Interactive route map"></div>
            <div class="gas-map-tools" role="toolbar" aria-label="Route editing tools">
              <button type="button" class="gas-map-tool is-active" data-route-mode="inspect" aria-pressed="true">
                ${routeIcon}<span data-gas-i18n="mode.inspect"></span>
              </button>
              <button type="button" class="gas-map-tool" data-route-mode="setA" aria-pressed="false">
                ${pinIcon}<span data-gas-i18n="mode.setA"></span>
              </button>
              <button type="button" class="gas-map-tool" data-route-mode="setB" aria-pressed="false">
                ${pinIcon}<span data-gas-i18n="mode.setB"></span>
              </button>
              <button type="button" class="gas-map-tool" data-route-mode="addWaypoint" aria-pressed="false">
                ${addIcon}<span data-gas-i18n="mode.addWaypoint"></span>
              </button>
            </div>
            <div class="gas-map-actions">
              <button type="button" id="removeWaypointButton" class="gas-icon-action" data-gas-i18n-title="action.removeWaypoint" data-gas-i18n-aria-label="action.removeWaypoint" aria-label="Remove waypoint">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M9 7V4h6v3M8 7l1 13h6l1-13"></path></svg>
              </button>
              <button type="button" id="clearWaypointsButton" class="gas-icon-action" data-gas-i18n-title="action.clearWaypoints" data-gas-i18n-aria-label="action.clearWaypoints" aria-label="Clear waypoints">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M7 18h10M9 12V5h6v10"></path></svg>
              </button>
              <button type="button" id="fitRouteButton" class="gas-icon-action" data-gas-i18n-title="action.fitRoute" data-gas-i18n-aria-label="action.fitRoute" aria-label="Fit route">
                ${fitIcon}
              </button>
            </div>
            <div id="mapLoading" class="gas-map-state">
              <span class="gas-loader" aria-hidden="true"></span>
              <span data-gas-i18n="map.loading"></span>
            </div>
            <div id="mapError" class="gas-map-state gas-map-state--error" hidden>
              <strong data-gas-i18n="map.errorTitle"></strong>
              <span data-gas-i18n="map.errorBody"></span>
            </div>
          </div>
        </section>

        <div class="gas-analysis-grid">
          <section class="gas-analysis-card gas-surface-card" aria-labelledby="profileTitle">
            <div class="gas-card-heading">
              <div>
                <h2 id="profileTitle" data-gas-i18n="view.profile"></h2>
                <p class="gas-profile-data-line">
                  <span id="profileDataStatus" class="gas-elevation-status" data-gas-i18n="view.elevationLoading" aria-live="polite"></span>
                  <a class="gas-elevation-source" href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer" data-gas-i18n="view.elevationSource"></a>
                </p>
              </div>
              <div class="gas-profile-heading-actions">
                <button type="button" id="retryElevationButton" class="gas-profile-retry" data-gas-i18n-title="action.retryElevation" data-gas-i18n-aria-label="action.retryElevation" hidden>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 9A7 7 0 0 1 18.7 7M17.9 15A7 7 0 0 1 5.3 17"></path></svg>
                </button>
                <span id="profileStationLabel" class="gas-station-pill">—</span>
              </div>
            </div>
            <svg id="profileSvg" class="gas-diagram" viewBox="0 0 720 220" role="img" aria-labelledby="profileTitle"></svg>
          </section>

          <section class="gas-analysis-card gas-surface-card" aria-labelledby="crossSectionTitle">
            <div class="gas-card-heading">
              <div>
                <h2 id="crossSectionTitle" data-gas-i18n="view.crossSection"></h2>
                <p id="crossSectionSegmentLabel">—</p>
              </div>
              <span class="gas-section-scale">NTS</span>
            </div>
            <svg id="crossSectionSvg" class="gas-diagram" viewBox="0 0 480 220" role="img" aria-labelledby="crossSectionTitle"></svg>
          </section>
        </div>
      </section>

      <aside id="gasSidebar" class="gas-sidebar shared-settings-panel shared-settings-panel--light" aria-label="Gas pipe settings">
        <div class="gas-sidebar__intro">
          <div>
            <span class="gas-status-chip gas-status-chip--warning" data-gas-i18n="badge.preliminary"></span>
            <p data-gas-i18n="hint.compliance"></p>
          </div>
        </div>

        <details class="gas-panel" open>
          <summary><span data-gas-i18n="panel.route"></span><span class="gas-panel__chevron" aria-hidden="true"></span></summary>
          <div class="gas-panel__body">
            <label class="gas-field gas-field--range" for="stationInput">
              <span><b data-gas-i18n="field.station"></b><output id="stationValue">—</output></span>
              <input id="stationInput" type="range" min="0" max="100" step="1" value="0" />
            </label>
            <div class="gas-segment-card">
              <span data-gas-i18n="field.selectedSegment"></span>
              <strong id="selectedSegmentLabel">—</strong>
              <small><span data-gas-i18n="field.segmentLength"></span> · <span id="selectedSegmentLength">—</span></small>
            </div>
            <div class="gas-field-grid">
              <label class="gas-field" for="groundTypeSelect">
                <span data-gas-i18n="field.groundType"></span>
                <select id="groundTypeSelect">
                  ${option('common', 'option.ground.common', true)}
                  ${option('cohesive', 'option.ground.cohesive')}
                  ${option('granular', 'option.ground.granular')}
                  ${option('softRock', 'option.ground.softRock')}
                  ${option('hardRock', 'option.ground.hardRock')}
                </select>
              </label>
              <label class="gas-field" for="surfaceTypeSelect">
                <span data-gas-i18n="field.surfaceType"></span>
                <select id="surfaceTypeSelect">
                  ${option('greenfield', 'option.surface.greenfield', true)}
                  ${option('pavers', 'option.surface.pavers')}
                  ${option('asphalt', 'option.surface.asphalt')}
                  ${option('concrete', 'option.surface.concrete')}
                </select>
              </label>
            </div>
            <p class="gas-field-hint" data-gas-i18n="hint.segment"></p>
          </div>
        </details>

        <details class="gas-panel" open>
          <summary><span data-gas-i18n="panel.pipe"></span><span class="gas-panel__chevron" aria-hidden="true"></span></summary>
          <div class="gas-panel__body">
            <div class="gas-field-grid">
              <label class="gas-field" for="materialSelect"><span data-gas-i18n="field.material"></span>
                <select id="materialSelect">
                  ${option('pe100rc', 'option.material.pe100rc', true)}
                  ${option('pe100', 'option.material.pe100')}
                </select>
              </label>
              <label class="gas-field" for="diameterSelect"><span data-gas-i18n="field.diameter"></span>
                <select id="diameterSelect">
                  <option value="32">32 mm</option><option value="40">40 mm</option><option value="63" selected>63 mm</option><option value="90">90 mm</option><option value="110">110 mm</option>
                </select>
              </label>
              <label class="gas-field" for="sdrSelect"><span data-gas-i18n="field.sdr"></span>
                <select id="sdrSelect"><option value="SDR11">SDR11</option><option value="SDR17">SDR17</option></select>
              </label>
              <label class="gas-field" for="pressureInput"><span data-gas-i18n="field.pressure"></span>
                <span class="gas-input-with-unit"><input id="pressureInput" type="number" min="0.05" max="6" step="0.05" /><em>bar</em></span>
              </label>
              <label class="gas-field" for="coverInput"><span data-gas-i18n="field.cover"></span>
                <span class="gas-input-with-unit"><input id="coverInput" type="number" min="0.3" max="3" step="0.05" /><em>m</em></span>
              </label>
              <label class="gas-field" for="trenchWidthInput"><span data-gas-i18n="field.trenchWidth"></span>
                <span class="gas-input-with-unit"><input id="trenchWidthInput" type="number" min="0.3" max="2" step="0.05" /><em>m</em></span>
              </label>
              <label class="gas-field" for="beddingInput"><span data-gas-i18n="field.bedding"></span>
                <span class="gas-input-with-unit"><input id="beddingInput" type="number" min="0.05" max="0.5" step="0.05" /><em>m</em></span>
              </label>
            </div>
            <p class="gas-field-hint" data-gas-i18n="hint.pipe"></p>
          </div>
        </details>

        <details class="gas-panel">
          <summary><span data-gas-i18n="panel.data"></span><span class="gas-panel__chevron" aria-hidden="true"></span></summary>
          <div class="gas-panel__body">
            <label class="gas-field" for="groundSourceSelect"><span data-gas-i18n="field.groundSource"></span>
              <select id="groundSourceSelect">
                ${option('assumption', 'option.groundSource.assumption', true)}
                ${option('publicScreening', 'option.groundSource.publicScreening')}
                ${option('verifiedSurvey', 'option.groundSource.verifiedSurvey')}
              </select>
            </label>
            <label class="gas-field" for="utilitySourceSelect"><span data-gas-i18n="field.utilitySource"></span>
              <select id="utilitySourceSelect">
                ${option('missing', 'option.utilitySource.missing', true)}
                ${option('ownerPlan', 'option.utilitySource.ownerPlan')}
                ${option('fieldVerified', 'option.utilitySource.fieldVerified')}
              </select>
            </label>
            <div class="gas-field-grid">
              <label class="gas-field" for="startElevationInput"><span data-gas-i18n="field.startElevation"></span>
                <span class="gas-input-with-unit"><input id="startElevationInput" type="number" min="-50" max="2500" step="0.1" /><em>m</em></span>
              </label>
              <label class="gas-field" for="endElevationInput"><span data-gas-i18n="field.endElevation"></span>
                <span class="gas-input-with-unit"><input id="endElevationInput" type="number" min="-50" max="2500" step="0.1" /><em>m</em></span>
              </label>
            </div>
            <label class="gas-check-row" for="osdCapacityInput">
              <input id="osdCapacityInput" type="checkbox" />
              <span><b data-gas-i18n="field.osdCapacity"></b></span>
            </label>
            <p class="gas-field-hint" data-gas-i18n="hint.elevation"></p>
          </div>
        </details>

        <details class="gas-panel" open>
          <summary><span data-gas-i18n="panel.results"></span><span class="gas-panel__chevron" aria-hidden="true"></span></summary>
          <div class="gas-panel__body">
            <div class="gas-primary-result">
              <span data-gas-i18n="metric.costRange"></span>
              <strong id="costRangeResult">—</strong>
              <small data-gas-i18n="hint.cost"></small>
            </div>
            <div class="gas-metrics-grid">
              ${metric('routeLengthResult', 'metric.routeLength')}
              ${metric('pipeLengthResult', 'metric.pipeLength')}
              ${metric('excavationResult', 'metric.excavation')}
              ${metric('beddingResult', 'metric.bedding')}
              ${metric('restorationResult', 'metric.restoration')}
              ${metric('dataConfidenceResult', 'metric.dataConfidence')}
            </div>
            <div class="gas-throughput-row">
              <span data-gas-i18n="metric.throughput"></span>
              <strong id="throughputResult" data-gas-i18n="metric.throughputPending"></strong>
            </div>
          </div>
        </details>

        <details class="gas-panel" open>
          <summary>
            <span data-gas-i18n="panel.compliance"></span>
            <span id="validationSummary" class="gas-validation-count">—</span>
            <span class="gas-panel__chevron" aria-hidden="true"></span>
          </summary>
          <div class="gas-panel__body">
            <p class="gas-field-hint" data-gas-i18n="hint.compliance"></p>
            <div id="validationList" class="gas-validation-list" aria-live="polite"></div>
          </div>
        </details>
      </aside>

      <button id="gasSidebarToggle" class="shared-settings-toggle shared-settings-toggle--light" type="button" aria-label="Hide gas pipe settings" aria-expanded="true" title="Hide gas pipe settings">
        <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    </main>
  `;
}
