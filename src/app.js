// @file app.js
// @brief Единственный JS Weather PWA: вся логика приложения (14 логических модулей в секциях/region)
// @context{Загружается из index.html (classic script, defer); в Node — через UMD-хвост (require) для тестов; вызывает weather-API, localStorage, Intl, DOM}
// @strategy{Vanilla ES2020, classic script (NC-1), без import/export; UMD-хвост (D-UMD) для тестируемости; injectable fetcher (D-INJECT-FETCH); безопасный рендер без innerHTML (NC-2/S-9)}
// @keywords{WEATHER_PWA, VANILLA_JS, UMD, PROVIDERS, FORECAST, PWA}
// GREP_SUMMARY: app.js, weather, PWA, vanilla JS, UMD, providers, openmeteo, wttr, met, forecast, conditions, icons, storage, geo, cache, theme, settings, refresh, bootstrap, format, i18n

(function (root, factory) {
  var api = factory();
  // Node/Tester: module.exports (D-UMD)
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  // Браузер: globalThis.WEATHER
  root.WEATHER = api;
  // Авто-boot только в браузере и без флага тестов (D-UMD, DOM-guard)
  if (typeof document !== 'undefined' && !root.__WEATHER_NO_BOOT__) { api.__boot(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ================================================================
  // region MOD_Logger
  // Module 1: Logger — единая точка belief-логов (rules.md §5, JS-форма)
  // ================================================================

  var _logSink = null; // injectable sink для Node-тестов

  // region FUNC_log
  // @startcontract LOG
  // @brief Вывести belief-лог в формате [FUNC_ID] [BELIEF: ...] | [INPUT: ...] | [EXPECTING: ...]
  // @keywords{LOGGING, BELIEF, TELEMETRY}
  // @invariant{Логгер никогда не бросает исключений}
  // @param[in] level 'info' | 'warn' | 'error'
  // @param[in] funcId идентификатор функции (FUNC_ID)
  // @param[in] belief строка инвариантов/предположений
  // @param[in] input строка входных данных (опционально)
  // @param[in] expecting строка ожидаемого результата (опционально)
  // @return void
  // @endcontract LOG
  function log(level, funcId, belief, input, expecting) {
    try {
      var parts = ['[' + funcId + '] [BELIEF: ' + (belief || '') + ']'];
      if (input) { parts.push('[INPUT: ' + input + ']'); }
      if (expecting) { parts.push('[EXPECTING: ' + expecting + ']'); }
      var msg = parts.join(' | ');
      if (_logSink) { _logSink(level, msg); return; }
      if (typeof console !== 'undefined') {
        if (level === 'error') { console.error(msg); }
        else if (level === 'warn') { console.warn(msg); }
        else { console.info(msg); }
      }
    } catch (_e) { /* NC-7: логгер не бросает */ }
  }
  // endregion FUNC_log

  var Logger = {
    info: function (funcId, belief, input, expecting) { log('info', funcId, belief, input, expecting); },
    warn: function (funcId, belief, input, expecting) { log('warn', funcId, belief, input, expecting); },
    error: function (funcId, belief, input, expecting) { log('error', funcId, belief, input, expecting); },
    setSink: function (fn) { _logSink = fn; }
  };

  // endregion MOD_Logger

  // ================================================================
  // region MOD_Config
  // Module 2: Config — все «магические» значения в одном месте
  // ================================================================

  var Config = {
    PROVIDERS: [
      { id: 'wttr', name: 'wttr.in', order: 0 },
      { id: 'openmeteo', name: 'Open-Meteo', order: 1 },
      { id: 'met', name: 'MET Norway', order: 2 }
    ],
    DEFAULTS: {
      providerId: 'wttr',
      autoRefreshMin: 15,
      themeId: 'paper-fir'
    },
    STORAGE_KEYS: {
      settings: 'wpwa_settings',
      location: 'wpwa_location',
      recents: 'wpwa_recents',
      cachePrefix: 'wpwa_cache_'
    },
    REFRESH_PRESETS: [5, 10, 15, 30, 60, 0],
    REFRESH_MIN: 5,
    FETCH_TIMEOUT_MS: 15000,
    GEO_TIMEOUT_MS: 10000,
    SCHEMA_VERSION: 1,
    RECENTS_CAP: 5,
    SEARCH_DEBOUNCE_MS: 400,
    SEARCH_MAX_LEN: 100
  };

  // endregion MOD_Config

  // ================================================================
  // region MOD_I18n
  // Module 3: I18n + Format — словарь русских UI-строк + чистые форматтеры
  // ================================================================

  var STR = {
    appTitle: 'Погода',
    wind: 'Ветер',
    humidity: 'Влажность',
    precip: 'Осадки',
    feelsLike: 'Ощущается',
    pressure: 'Давление',
    uvIndex: 'УФ-индекс',
    sunrise: 'Восход',
    sunset: 'Закат',
    updatedJust: 'Только что',
    updatedMin: 'Обновлено',
    minAgo: 'мин назад',
    hAgo: 'ч назад',
    dAgo: 'дн назад',
    loading: 'Загрузка…',
    offline: 'Офлайн',
    retry: 'Повторить',
    errorTitle: 'Не удалось загрузить',
    errorNetwork: 'Проверьте подключение и попробуйте снова.',
    errorProvider: 'Источник данных временно недоступен.',
    errorParse: 'Не удалось обработать ответ сервера.',
    errorForbidden: 'Источник данных отклонил запрос.',
    emptyTitle: 'Добро пожаловать',
    emptyText: 'Выберите город через поиск или разрешите доступ к местоположению.',
    geoDeniedTitle: 'Геолокация недоступна',
    geoDeniedText: 'Доступ к местоположению отклонён. Воспользуйтесь поиском города.',
    noResults: 'Ничего не найдено. Попробуйте другой запрос.',
    searchPlaceholder: 'Поиск города…',
    myLocation: 'Моё местоположение',
    recents: 'Недавние',
    settings: 'Настройки',
    provider: 'Источник данных',
    city: 'Город',
    autoRefresh: 'Автообновление',
    theme: 'Оформление',
    about: 'О приложении',
    off: 'выкл',
    minShort: 'мин',
    windUnit: 'м/с',
    mmUnit: 'мм',
    mmHgUnit: 'мм рт. ст.',
    settingsClose: 'Закрыть настройки',
    refreshLabel: 'Обновить прогноз',
    geolocateLabel: 'Определить моё местоположение',
    themeFir: 'Бумага + пихта',
    themeNight: 'Ночная бумага',
    themeCool: 'Холодная бумага',
    themeSystem: 'Как в системе'
  };

  var I18n = { STR: STR };

  // region FUNC_fmtTempSigned
  // @startcontract FMT_TEMP_SIGNED
  // @brief Форматировать температуру с ведущим знаком (+22 / -3)
  // @keywords{FORMAT, TEMPERATURE}
  // @invariant{Для >=0 всегда ведущий знак +}
  // @param[in] c температура в °C (число)
  // @return строка вида +22 / -3 / 0
  // @endcontract FMT_TEMP_SIGNED
  function fmtTempSigned(c) {
    if (c == null || isNaN(c)) { return '—'; }
    var n = Math.round(c);
    return (n >= 0 ? '+' : '') + n;
  }
  // endregion FUNC_fmtTempSigned

  // @brief Форматировать скорость ветра @return строка вида 2м/с
  function fmtWind(ms) {
    if (ms == null || isNaN(ms)) { return '—'; }
    return Math.round(ms) + STR.windUnit;
  }

  // @brief Форматировать процент @return строка вида 69%
  function fmtPct(n) {
    if (n == null || isNaN(n)) { return '—'; }
    return Math.round(n) + '%';
  }

  // @brief Форматировать осадки @return строка вида 0.0мм
  function fmtPrecip(mm) {
    if (mm == null || isNaN(mm)) { return '—'; }
    return mm.toFixed(1) + STR.mmUnit;
  }

  // @brief Форматировать давление (гПа → мм рт. ст.) @return строка вида 747мм рт. ст.
  function fmtPressure(hpa) {
    if (hpa == null || isNaN(hpa)) { return '—'; }
    return Math.round(hpa * 0.750062) + ' ' + STR.mmHgUnit;
  }

  // region FUNC_fmtTimeHM
  // @startcontract FMT_TIME_HM
  // @brief Форматировать epochMs в ЧЧ:ММ в таймзоне локации
  // @keywords{FORMAT, TIME, TIMEZONE, INTL}
  // @invariant{Результат в таймзоне tz, не устройства}
  // @param[in] epochMs миллисекунды UTC
  // @param[in] tz IANA timezone строка
  // @return строка вида 10:00
  // @endcontract FMT_TIME_HM
  function fmtTimeHM(epochMs, tz) {
    if (!epochMs) { return '—'; }
    try {
      var opts = { hour: '2-digit', minute: '2-digit', hour12: false };
      if (tz) { opts.timeZone = tz; }
      return new Intl.DateTimeFormat('ru', opts).format(new Date(epochMs));
    } catch (_e) {
      return new Date(epochMs).toTimeString().slice(0, 5);
    }
  }
  // endregion FUNC_fmtTimeHM

  // region FUNC_fmtDayLabel
  // @startcontract FMT_DAY_LABEL
  // @brief Форматировать epochMs в «Среда, 22 июля» в таймзоне локации
  // @keywords{FORMAT, DATE, TIMEZONE, INTL}
  // @invariant{Русские названия через Intl locale:'ru', не хардкод-массив}
  // @param[in] epochMs миллисекунды UTC (любой момент дня)
  // @param[in] tz IANA timezone строка
  // @return строка вида Среда, 22 июля
  // @endcontract FMT_DAY_LABEL
  function fmtDayLabel(epochMs, tz) {
    if (!epochMs) { return '—'; }
    try {
      var result = new Intl.DateTimeFormat('ru', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: tz
      }).format(new Date(epochMs));
      // Intl ru даёт lowercase weekday — капитализируем первую букву
      return result.charAt(0).toUpperCase() + result.slice(1);
    } catch (_e) {
      return new Date(epochMs).toLocaleDateString('ru');
    }
  }
  // endregion FUNC_fmtDayLabel

  // region FUNC_fmtUpdatedAt
  // @startcontract FMT_UPDATED_AT
  // @brief Относительное время обновления: «Обновлено 5 мин назад» / «N ч назад»
  // @keywords{FORMAT, RELATIVE_TIME}
  // @invariant{Всегда относительное, никогда абсолютное время}
  // @param[in] epochMs миллисекунды UTC момента обновления
  // @return строка
  // @endcontract FMT_UPDATED_AT
  function fmtUpdatedAt(epochMs) {
    if (!epochMs) { return ''; }
    var diffMin = Math.floor((Date.now() - epochMs) / 60000);
    if (diffMin < 1) { return STR.updatedJust; }
    if (diffMin < 60) { return STR.updatedMin + ' ' + diffMin + ' ' + STR.minAgo; }
    var diffH = Math.floor(diffMin / 60);
    if (diffH < 24) { return STR.updatedMin + ' ' + diffH + ' ' + STR.hAgo; }
    var diffD = Math.floor(diffH / 24);
    return STR.updatedMin + ' ' + diffD + ' ' + STR.dAgo;
  }
  // endregion FUNC_fmtUpdatedAt

  // @brief Форматировать координаты для подзаголовка @return 54.85°N · 83.06°E
  function fmtCoords(lat, lon) {
    if (lat == null || lon == null) { return ''; }
    var ns = lat >= 0 ? 'N' : 'S';
    var ew = lon >= 0 ? 'E' : 'W';
    return Math.abs(lat).toFixed(2) + '°' + ns + ' · ' + Math.abs(lon).toFixed(2) + '°' + ew;
  }

  var Format = {
    fmtTempSigned: fmtTempSigned,
    fmtWind: fmtWind,
    fmtPct: fmtPct,
    fmtPrecip: fmtPrecip,
    fmtPressure: fmtPressure,
    fmtTimeHM: fmtTimeHM,
    fmtDayLabel: fmtDayLabel,
    fmtUpdatedAt: fmtUpdatedAt,
    fmtCoords: fmtCoords
  };

  // endregion MOD_I18n

  // ================================================================
  // region MOD_Icons
  // Module 4: Icons — inline-SVG строки (тематизация через currentColor)
  // ================================================================

  var _svgWrap = function (inner, size) {
    size = size || 24;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size +
      '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  };

  var _weatherPaths = {
    clear: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    few_clouds: '<circle cx="12" cy="10" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="2" y1="10" x2="4" y2="10"/><path d="M8 18h9a4 4 0 0 0 0-8h-1a5 5 0 0 0-9.5 2A3.5 3.5 0 0 0 8 18z"/>',
    cloudy: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    overcast: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="M13 16a4 4 0 0 0-8 0" opacity="0.5"/>',
    drizzle: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><line x1="8" y1="21" x2="8" y2="23"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="16" y1="21" x2="16" y2="23"/>',
    rain: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><line x1="8" y1="21" x2="7" y2="24"/><line x1="12" y1="21" x2="11" y2="24"/><line x1="16" y1="21" x2="15" y2="24"/>',
    heavy_rain: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><line x1="7" y1="21" x2="5.5" y2="24"/><line x1="10.5" y1="21" x2="9" y2="24"/><line x1="14" y1="21" x2="12.5" y2="24"/><line x1="17.5" y1="21" x2="16" y2="24"/>',
    snow: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><circle cx="8" cy="22" r="0.5" fill="currentColor"/><circle cx="12" cy="23" r="0.5" fill="currentColor"/><circle cx="16" cy="22" r="0.5" fill="currentColor"/>',
    thunder: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><polyline points="13 14 11 18 14 18 12 22"/>',
    fog: '<line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/><line x1="6" y1="20" x2="18" y2="20"/>'
  };

  // @startcontract WEATHER_ICON
  // @brief Вернуть SVG-строку контурной иконки погоды по iconId
  // @keywords{ICON, SVG, WEATHER}
  // @invariant{При неизвестном iconId — fallback на cloudy}
  // @param[in] iconId идентификатор иконки из CONDITIONS
  // @param[in] size размер в px (опционально, дефолт 24)
  // @return SVG-строка
  // @endcontract WEATHER_ICON
  function weatherIcon(iconId, size) {
    var path = _weatherPaths[iconId] || _weatherPaths.cloudy;
    return _svgWrap(path, size);
  }

  var _uiPaths = {
    geo: '<circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>'
  };

  // @brief Вернуть SVG-строку UI-иконки @return SVG-строка
  function uiIcon(name, size) {
    var path = _uiPaths[name] || _uiPaths.geo;
    return _svgWrap(path, size || 18);
  }

  // region FUNC_windArrow
  // @startcontract WIND_ARROW
  // @brief Вернуть SVG-стрелку ветра, повёрнутую по windDirDeg
  // @keywords{ICON, SVG, WIND}
  // @invariant{Стрелка указывает КУДА дует ветер (по метеоконвенции: deg=0 → северный ветер дует на юг → стрелка вниз)}
  // @param[in] deg направление ветра в градусах (0-360, метеорологическое)
  // @param[in] size размер в px (опционально)
  // @return SVG-строка с transform rotate
  // @endcontract WIND_ARROW
  function windArrow(deg, size) {
    size = size || 12;
    // Метео: 0° = ветер с севера → стрелка указывает на юг (вниз) → rotate(180)
    var angle = ((deg || 0) + 180) % 360;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size +
      '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" ' +
      'style="transform:rotate(' + angle + 'deg)">' +
      '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  }
  // endregion FUNC_windArrow

  var Icons = {
    weatherIcon: weatherIcon,
    uiIcon: uiIcon,
    windArrow: windArrow
  };

  // endregion MOD_Icons

  // ================================================================
  // region MOD_Conditions
  // Module 5: Conditions — чистые таблицы маппинга кодов погоды
  // ================================================================

  var CONDITIONS = {
    CLEAR:       { iconId: 'clear',      ru: 'Ясно' },
    FEW_CLOUDS:  { iconId: 'few_clouds', ru: 'Малооблачно' },
    CLOUDY:      { iconId: 'cloudy',     ru: 'Облачно' },
    OVERCAST:    { iconId: 'overcast',   ru: 'Пасмурно' },
    DRIZZLE:     { iconId: 'drizzle',    ru: 'Морось' },
    RAIN:        { iconId: 'rain',       ru: 'Дождь' },
    HEAVY_RAIN:  { iconId: 'heavy_rain', ru: 'Сильный дождь' },
    SNOW:        { iconId: 'snow',       ru: 'Снег' },
    THUNDER:     { iconId: 'thunder',    ru: 'Гроза' },
    FOG:         { iconId: 'fog',        ru: 'Туман' }
  };

  // @brief conditionCode → iconId @return строка iconId
  function conditionToIconId(code) {
    var c = CONDITIONS[code];
    return c ? c.iconId : 'cloudy';
  }

  // @brief conditionCode → русское название @return строка
  function conditionToRu(code) {
    var c = CONDITIONS[code];
    return c ? c.ru : 'Облачно';
  }

  // region FUNC_wmoToCondition
  // @startcontract WMO_TO_CONDITION
  // @brief Маппинг WMO-кода (Open-Meteo) → conditionCode
  // @keywords{PROVIDER, OPENMETEO, WMO, MAPPING}
  // @invariant{При неизвестном коде → CLOUDY (безопасный fallback)}
  // @param[in] code числовой WMO-код
  // @return conditionCode строка
  // @endcontract WMO_TO_CONDITION
  function wmoToCondition(code) {
    var c = Number(code);
    if (c === 0) { return 'CLEAR'; }
    if (c === 1) { return 'FEW_CLOUDS'; }
    if (c === 2 || c === 3) { return 'CLOUDY'; }
    if (c === 45 || c === 48) { return 'FOG'; }
    if (c >= 51 && c <= 57) { return 'DRIZZLE'; }
    if (c >= 61 && c <= 67) { return 'RAIN'; }
    if (c >= 71 && c <= 77) { return 'SNOW'; }
    if (c >= 80 && c <= 82) { return 'RAIN'; }
    if (c === 85 || c === 86) { return 'SNOW'; }
    if (c >= 95 && c <= 99) { return 'THUNDER'; }
    return 'CLOUDY';
  }
  // endregion FUNC_wmoToCondition

  // region FUNC_wttrCodeToCondition
  // @startcontract WTTR_CODE_TO_CONDITION
  // @brief Маппинг wttr weatherCode → conditionCode
  // @keywords{PROVIDER, WTTR, MAPPING}
  // @invariant{При неизвестном коде → CLOUDY}
  // @param[in] code числовой код wttr (113, 116, ...)
  // @return conditionCode строка
  // @endcontract WTTR_CODE_TO_CONDITION
  function wttrCodeToCondition(code) {
    var c = Number(code);
    if (c === 113) { return 'CLEAR'; }
    if (c === 116) { return 'FEW_CLOUDS'; }
    if (c === 119) { return 'CLOUDY'; }
    if (c === 122) { return 'OVERCAST'; }
    if (c === 143 || c === 248 || c === 260) { return 'FOG'; }
    if (c >= 176 && c <= 185) { return 'DRIZZLE'; }
    if (c >= 263 && c <= 284) { return 'DRIZZLE'; }
    if (c >= 293 && c <= 308) { return 'RAIN'; }
    if (c >= 311 && c <= 320) { return 'RAIN'; }
    if (c >= 323 && c <= 338) { return 'SNOW'; }
    if (c >= 350 && c <= 377) { return 'RAIN'; }
    if (c >= 386) { return 'THUNDER'; }
    if (c === 200) { return 'THUNDER'; }
    if (c === 227 || c === 230) { return 'SNOW'; }
    return 'CLOUDY';
  }
  // endregion FUNC_wttrCodeToCondition

  // region FUNC_metSymbolToCondition
  // @startcontract MET_SYMBOL_TO_CONDITION
  // @brief Маппинг MET Norway symbol-кода → conditionCode
  // @keywords{PROVIDER, MET, MAPPING}
  // @invariant{Суффиксы _day/_night/_polartwilight игнорируются; при неизвестном → CLOUDY}
  // @param[in] symbol строка symbol-кода (clearsky, lightrain, ...)
  // @return conditionCode строка
  // @endcontract MET_SYMBOL_TO_CONDITION
  function metSymbolToCondition(symbol) {
    var s = String(symbol || '').replace(/_(day|night|polartwilight)$/, '').toLowerCase();
    if (s === 'clearsky') { return 'CLEAR'; }
    if (s === 'fair') { return 'FEW_CLOUDS'; }
    if (s === 'partlycloudy') { return 'CLOUDY'; }
    if (s === 'cloudy') { return 'OVERCAST'; }
    if (s === 'fog') { return 'FOG'; }
    if (s.indexOf('sleet') !== -1) { return 'RAIN'; }
    if (s.indexOf('thunder') !== -1) { return 'THUNDER'; }
    if (s.indexOf('heavyrain') !== -1 || s === 'heavyrainshowers') { return 'HEAVY_RAIN'; }
    if (s.indexOf('rain') !== -1) { return 'RAIN'; }
    if (s.indexOf('heavysnow') !== -1) { return 'SNOW'; }
    if (s.indexOf('snow') !== -1) { return 'SNOW'; }
    if (s.indexOf('drizzle') !== -1) { return 'DRIZZLE'; }
    return 'CLOUDY';
  }
  // endregion FUNC_metSymbolToCondition

  var Conditions = {
    CONDITIONS: CONDITIONS,
    conditionToIconId: conditionToIconId,
    conditionToRu: conditionToRu,
    wmoToCondition: wmoToCondition,
    wttrCodeToCondition: wttrCodeToCondition,
    metSymbolToCondition: metSymbolToCondition
  };

  // endregion MOD_Conditions

  // ================================================================
  // region MOD_Storage
  // Module 6: Storage — обёртка над localStorage с try/catch и in-memory fallback
  // ================================================================

  var _memStore = {}; // in-memory fallback при недоступности localStorage

  // @brief Безопасно прочитать из localStorage @return строка или null
  function _lsGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_e) {
      return _memStore[key] || null;
    }
  }

  // @brief Безопасно записать в localStorage @return void
  function _lsSet(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (_e) {
      _memStore[key] = val;
    }
  }

  // @brief Безопасно удалить из localStorage @return void
  function _lsRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_e) {
      delete _memStore[key];
    }
  }

  // region FUNC_loadSettings
  // @startcontract LOAD_SETTINGS
  // @brief Загрузить настройки, merge с дефолтами
  // @keywords{STORAGE, SETTINGS, PERSIST}
  // @invariant{Всегда возвращает валидный AppSettings (merge с DEFAULTS)}
  // @return AppSettings объект
  // @endcontract LOAD_SETTINGS
  function loadSettings() {
    var raw = _lsGet(Config.STORAGE_KEYS.settings);
    var parsed = null;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch (_e) { parsed = null; }
    }
    var s = {
      providerId: Config.DEFAULTS.providerId,
      autoRefreshMin: Config.DEFAULTS.autoRefreshMin,
      themeId: Config.DEFAULTS.themeId
    };
    if (parsed && typeof parsed === 'object') {
      if (parsed.providerId) { s.providerId = parsed.providerId; }
      if (typeof parsed.autoRefreshMin === 'number') { s.autoRefreshMin = parsed.autoRefreshMin; }
      if (parsed.themeId) { s.themeId = parsed.themeId; }
    }
    Logger.info('SETTINGS_LOAD', 'loaded', 'providerId=' + s.providerId, 'AppSettings');
    return s;
  }
  // endregion FUNC_loadSettings

  // @brief Сохранить настройки @return void
  function saveSettings(s) {
    _lsSet(Config.STORAGE_KEYS.settings, JSON.stringify(s));
  }

  // @brief Загрузить активную локацию @return Location или null
  function loadLocation() {
    var raw = _lsGet(Config.STORAGE_KEYS.location);
    if (!raw) { return null; }
    try { return JSON.parse(raw); } catch (_e) { return null; }
  }

  // @brief Сохранить активную локацию @return void
  function saveLocation(loc) {
    if (loc) { _lsSet(Config.STORAGE_KEYS.location, JSON.stringify(loc)); }
  }

  // @brief Загрузить недавние локации @return Location[] (до 5)
  function loadRecents() {
    var raw = _lsGet(Config.STORAGE_KEYS.recents);
    if (!raw) { return []; }
    try {
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.slice(0, Config.RECENTS_CAP) : [];
    } catch (_e) { return []; }
  }

  // region FUNC_pushRecent
  // @startcontract PUSH_RECENT
  // @brief Добавить локацию в недавние (cap 5, без дублей по id)
  // @keywords{STORAGE, RECENTS}
  // @invariant{Максимум RECENTS_CAP записей; дубли по id удаляются}
  // @param[in] loc Location объект
  // @return void
  // @endcontract PUSH_RECENT
  function pushRecent(loc) {
    if (!loc || !loc.id) { return; }
    var recents = loadRecents().filter(function (r) { return r.id !== loc.id; });
    recents.unshift(loc);
    if (recents.length > Config.RECENTS_CAP) { recents = recents.slice(0, Config.RECENTS_CAP); }
    _lsSet(Config.STORAGE_KEYS.recents, JSON.stringify(recents));
  }
  // endregion FUNC_pushRecent

  // @brief Ключ кэша по локации и провайдеру @return строка
  function cacheKey(loc, providerId) {
    var locId = (loc && loc.id) ? loc.id : 'unknown';
    return Config.STORAGE_KEYS.cachePrefix + providerId + '_' + locId;
  }

  // @brief Загрузить кэш прогноза @return {bundle, savedAt} или null
  function loadCache(key) {
    var raw = _lsGet(key);
    if (!raw) { return null; }
    try { return JSON.parse(raw); } catch (_e) { return null; }
  }

  // @brief Сохранить кэш прогноза @return void
  function saveCache(key, bundle) {
    try {
      _lsSet(key, JSON.stringify({ bundle: bundle, savedAt: Date.now() }));
    } catch (_e) {
      Logger.error('STORAGE', 'cache save failed', 'key=' + key, 'void');
    }
  }

  var Storage = {
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadLocation: loadLocation,
    saveLocation: saveLocation,
    loadRecents: loadRecents,
    pushRecent: pushRecent,
    cacheKey: cacheKey,
    loadCache: loadCache,
    saveCache: saveCache
  };

  // endregion MOD_Storage

  // ================================================================
  // region FUNC_calcSunTimes
  // @startcontract CALC_SUN_TIMES
  // @brief Астрономическое вычисление восхода/заката по координатам и дате (упрощённый NOAA)
  // @keywords{ASTRONOMY, SUN, CALCULATION, UTIL}
  // @invariant{Чистая функция; полярный день/ночь → {null, null}; точность ~2 мин}
  // @param[in] lat широта в градусах
  // @param[in] lon долгота в градусах
  // @param[in] epochMs момент времени (любой в целевом дне, UTC)
  // @return {sunrise: epochMs|null, sunset: epochMs|null}
  // @rationale{Q: Почему не брать из API? A: Единый расчёт для всех 3 провайдеров, не зависит от полей ответа, чистая функция — тестируема}
  // @endcontract CALC_SUN_TIMES
  function calcSunTimes(lat, lon, epochMs) {
    var date = new Date(epochMs);
    var year = date.getUTCFullYear();
    var month = date.getUTCMonth();
    var day = date.getUTCDate();
    var start = Date.UTC(year, 0, 1);
    var dayOfYear = Math.floor((Date.UTC(year, month, day) - start) / 86400000) + 1;
    // Дробный год (радианы)
    var gamma = 2 * Math.PI / 365 * (dayOfYear - 1);
    // Уравнение времени (минуты)
    var eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
    // Склонение солнца (радианы)
    var decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
    // Часовой угол
    var latRad = lat * Math.PI / 180;
    var cosHA = -Math.tan(latRad) * Math.tan(decl);
    // Полярный день/ночь
    if (cosHA > 1 || cosHA < -1) { return { sunrise: null, sunset: null }; }
    var ha = Math.acos(cosHA) * 180 / Math.PI;
    // Восход/закат в минутах UTC от полуночи
    var sunriseMin = 720 - 4 * (lon + ha) - eqtime;
    var sunsetMin = 720 - 4 * (lon - ha) - eqtime;
    var base = Date.UTC(year, month, day);
    return {
      sunrise: base + sunriseMin * 60000,
      sunset: base + sunsetMin * 60000
    };
  }
  // endregion FUNC_calcSunTimes

  // ================================================================
  // region MOD_Providers
  // Module 8: Providers — адаптеры провайдеров + нормализация + ProviderError
  // ================================================================

  // region FUNC_ProviderError
  // @startcontract PROVIDER_ERROR
  // @brief Структурированная ошибка провайдера
  // @keywords{ERROR, PROVIDER}
  // @invariant{kind ∈ network|http|parse|cors|forbidden}
  // @param[in] providerId идентификатор провайдера
  // @param[in] kind тип ошибки
  // @param[in] status HTTP-статус (опционально)
  // @return ProviderError экземпляр
  // @endcontract PROVIDER_ERROR
  function ProviderError(providerId, kind, status) {
    this.name = 'ProviderError';
    this.providerId = providerId;
    this.kind = kind;
    this.status = status || null;
    this.message = 'Provider ' + providerId + ' error: ' + kind;
  }
  ProviderError.prototype = Object.create(Error.prototype);
  ProviderError.prototype.constructor = ProviderError;
  // endregion FUNC_ProviderError

  // region FUNC_timedFetch
  // @startcontract TIMED_FETCH
  // @brief Fetch с таймаутом через AbortController
  // @keywords{FETCH, TIMEOUT, NETWORK}
  // @invariant{Таймаут = Config.FETCH_TIMEOUT_MS; при abort → ProviderError kind=network}
  // @param[in] url строка URL
  // @param[in] fetcher injectable fetch-функция
  // @param[in] providerId для ошибок
  // @return Promise<Response>
  // @endcontract TIMED_FETCH
  function timedFetch(url, fetcher, providerId) {
    var f = fetcher || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    if (!f) { return Promise.reject(new ProviderError(providerId, 'network')); }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, Config.FETCH_TIMEOUT_MS);
    return f(url, { signal: controller.signal }).then(function (resp) {
      clearTimeout(timer);
      return resp;
    }).catch(function (err) {
      clearTimeout(timer);
      if (err instanceof ProviderError) { throw err; }
      throw new ProviderError(providerId, 'network');
    });
  }
  // endregion FUNC_timedFetch

  // @brief Проверить response.ok, бросить ProviderError при ошибке
  function checkResponse(resp, providerId) {
    if (!resp.ok) {
      var kind = resp.status === 403 ? 'forbidden' : 'http';
      throw new ProviderError(providerId, kind, resp.status);
    }
    return resp;
  }

  // @brief Безопасно парсить JSON, бросить ProviderError при ошибке
  function safeJson(resp, providerId) {
    return resp.json().catch(function () {
      throw new ProviderError(providerId, 'parse');
    });
  }

  // --- Open-Meteo адаптер ---

  var OM_URL = 'https://api.open-meteo.com/v1/forecast';
  var OM_HOURLY = 'temperature_2m,relative_humidity_2m,apparent_temperature,' +
    'precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover';
  var OM_CURRENT = 'temperature_2m,relative_humidity_2m,apparent_temperature,' +
    'precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,uv_index';

  // region FUNC_omNormalize
  // @startcontract OM_NORMALIZE
  // @brief Нормализовать сырой ответ Open-Meteo → ForecastBundle
  // @keywords{PROVIDER, OPENMETEO, NORMALIZE}
  // @invariant{meta.stepMinutes=60 (почасовой); время в tz локации}
  // @param[in] raw сырой JSON от Open-Meteo
  // @param[in] loc Location
  // @return ForecastBundle
  // @endcontract OM_NORMALIZE
  function omNormalize(raw, loc) {
    var h = raw.hourly || {};
    var cur = raw.current || {};
    var tz = loc.timezone || raw.timezone || 'UTC';
    var cc = Conditions.wmoToCondition(cur.weather_code);
    var sun = calcSunTimes(loc.lat, loc.lon, Date.now());
    var current = {
      tempC: cur.temperature_2m, feelsLikeC: cur.apparent_temperature,
      conditionCode: cc, conditionRu: Conditions.conditionToRu(cc),
      windSpeedMs: cur.wind_speed_10m, windDirDeg: cur.wind_direction_10m,
      humidityPct: cur.relative_humidity_2m, pressureHPa: cur.surface_pressure,
      precipMm: cur.precipitation || 0, cloudCoverPct: null,
      uvIndex: cur.uv_index, sunrise: sun.sunrise, sunset: sun.sunset, observedAtLocal: null
    };
    var points = [];
    var times = h.time || [];
    for (var i = 0; i < times.length; i++) {
      var ep = new Date(times[i]).getTime();
      var pcc = Conditions.wmoToCondition(h.weather_code ? h.weather_code[i] : null);
      points.push({
        timeLocalISO: times[i], epochMs: ep, tempC: h.temperature_2m[i],
        conditionCode: pcc, iconId: Conditions.conditionToIconId(pcc),
        windSpeedMs: h.wind_speed_10m[i], windDirDeg: h.wind_direction_10m[i],
        humidityPct: h.relative_humidity_2m[i], precipMm: h.precipitation[i] || 0,
        pressureHPa: h.surface_pressure ? h.surface_pressure[i] : null
      });
    }
    Logger.info('NORMALIZE', 'bundled', 'provider=openmeteo, points=' + points.length, 'ForecastBundle');
    return {
      current: current, days: groupByLocalDay(points, tz),
      meta: { id: 'openmeteo', name: 'Open-Meteo', stepMinutes: 60, horizonHours: Math.min(times.length, 72) }
    };
  }
  // endregion FUNC_omNormalize

  function omFetch(loc, opts) {
    var url = OM_URL + '?latitude=' + loc.lat + '&longitude=' + loc.lon +
      '&hourly=' + OM_HOURLY + '&current=' + OM_CURRENT +
      '&timezone=auto&forecast_days=3&wind_speed_unit=ms';
    return timedFetch(url, opts.fetcher, 'openmeteo')
      .then(function (r) { return checkResponse(r, 'openmeteo'); })
      .then(function (r) { return safeJson(r, 'openmeteo'); })
      .then(function (raw) { return omNormalize(raw, loc); });
  }

  // --- wttr.in адаптер ---

  // region FUNC_wttrNormalize
  // @startcontract WTTR_NORMALIZE
  // @brief Нормализовать сырой ответ wttr.in (j1) → ForecastBundle
  // @keywords{PROVIDER, WTTR, NORMALIZE}
  // @invariant{meta.stepMinutes=180 (шаг 3ч); ветер km/h → m/s}
  // @param[in] raw сырой JSON от wttr (format=j1)
  // @param[in] loc Location
  // @return ForecastBundle
  // @endcontract WTTR_NORMALIZE
  function wttrNormalize(raw, loc) {
    var tz = loc.timezone || 'UTC';
    var cc0 = raw.current_condition && raw.current_condition[0];
    var cc = cc0 ? Conditions.wttrCodeToCondition(cc0.weatherCode) : 'CLOUDY';
    var sun = calcSunTimes(loc.lat, loc.lon, Date.now());
    var current = {
      tempC: cc0 ? Number(cc0.temp_C) : null,
      feelsLikeC: cc0 ? Number(cc0.FeelsLikeC) : null,
      conditionCode: cc, conditionRu: Conditions.conditionToRu(cc),
      windSpeedMs: cc0 ? Number(cc0.windspeedKmph) / 3.6 : null,
      windDirDeg: cc0 ? Number(cc0.winddirDegree) : null,
      humidityPct: cc0 ? Number(cc0.humidity) : null,
      pressureHPa: cc0 ? Number(cc0.pressure) : null,
      precipMm: cc0 ? Number(cc0.precipMM) : 0,
      cloudCoverPct: cc0 ? Number(cc0.cloudcover) : null,
      uvIndex: cc0 ? Number(cc0.uvIndex) : null,
      sunrise: sun.sunrise, sunset: sun.sunset, observedAtLocal: null
    };
    var points = [];
    var days = raw.weather || [];
    for (var d = 0; d < days.length; d++) {
      var dateStr = days[d].date;
      var hourly = days[d].hourly || [];
      for (var i = 0; i < hourly.length; i++) {
        var hr = hourly[i];
        var hh = String(hr.time).padStart(4, '0');
        var iso = dateStr + 'T' + hh.slice(0, 2) + ':' + hh.slice(2) + ':00';
        var ep = new Date(iso).getTime();
        var pcc = Conditions.wttrCodeToCondition(hr.weatherCode);
        points.push({
          timeLocalISO: iso, epochMs: ep, tempC: Number(hr.tempC),
          conditionCode: pcc, iconId: Conditions.conditionToIconId(pcc),
          windSpeedMs: Number(hr.windspeedKmph) / 3.6,
          windDirDeg: Number(hr.winddirDegree),
          humidityPct: Number(hr.humidity), precipMm: Number(hr.precipMM) || 0,
          pressureHPa: Number(hr.pressure) || null
        });
      }
    }
    Logger.info('NORMALIZE', 'bundled', 'provider=wttr, points=' + points.length, 'ForecastBundle');
    return {
      current: current, days: groupByLocalDay(points, tz),
      meta: { id: 'wttr', name: 'wttr.in', stepMinutes: 180, horizonHours: days.length * 24 }
    };
  }
  // endregion FUNC_wttrNormalize

  function wttrFetch(loc, opts) {
    var url = 'https://wttr.in/' + loc.lat + ',' + loc.lon + '?format=j1';
    return timedFetch(url, opts.fetcher, 'wttr')
      .then(function (r) { return checkResponse(r, 'wttr'); })
      .then(function (r) { return safeJson(r, 'wttr'); })
      .then(function (raw) { return wttrNormalize(raw, loc); });
  }

  // --- MET Norway адаптер ---

  // region FUNC_metNormalize
  // @startcontract MET_NORMALIZE
  // @brief Нормализовать сырой ответ MET Norway → ForecastBundle
  // @keywords{PROVIDER, MET, NORMALIZE}
  // @invariant{meta.stepMinutes=60; symbol-суффиксы игнорируются}
  // @param[in] raw сырой JSON от MET
  // @param[in] loc Location
  // @return ForecastBundle
  // @endcontract MET_NORMALIZE
  function metNormalize(raw, loc) {
    var tz = loc.timezone || 'UTC';
    var ts = (raw.properties && raw.properties.timeseries) || [];
    var first = ts[0];
    var det = first && first.data && first.data.instant ? first.data.instant.details : {};
    var sym = first && first.data && first.data.next_1_hours
      ? first.data.next_1_hours.summary.symbol_code : null;
    var cc = Conditions.metSymbolToCondition(sym);
    var sun = calcSunTimes(loc.lat, loc.lon, Date.now());
    var current = {
      tempC: det.air_temperature, feelsLikeC: null,
      conditionCode: cc, conditionRu: Conditions.conditionToRu(cc),
      windSpeedMs: det.wind_speed, windDirDeg: det.wind_from_direction,
      humidityPct: det.relative_humidity, pressureHPa: det.air_pressure_at_sea_level,
      precipMm: 0, cloudCoverPct: det.cloud_area_fraction, uvIndex: null,
      sunrise: sun.sunrise, sunset: sun.sunset, observedAtLocal: null
    };
    var points = [];
    for (var i = 0; i < ts.length; i++) {
      var entry = ts[i];
      var d = entry.data || {};
      var inst = d.instant ? d.instant.details : {};
      var next = d.next_1_hours || d.next_6_hours || {};
      var pSym = next.summary ? next.summary.symbol_code : null;
      var pcc = Conditions.metSymbolToCondition(pSym);
      var precip = next.details ? next.details.precipitation_amount : null;
      points.push({
        timeLocalISO: entry.time, epochMs: new Date(entry.time).getTime(),
        tempC: inst.air_temperature, conditionCode: pcc,
        iconId: Conditions.conditionToIconId(pcc),
        windSpeedMs: inst.wind_speed, windDirDeg: inst.wind_from_direction,
        humidityPct: inst.relative_humidity, precipMm: precip || 0,
        pressureHPa: inst.air_pressure_at_sea_level || null
      });
    }
    Logger.info('NORMALIZE', 'bundled', 'provider=met, points=' + points.length, 'ForecastBundle');
    return {
      current: current, days: groupByLocalDay(points, tz),
      meta: { id: 'met', name: 'MET Norway', stepMinutes: 60, horizonHours: Math.min(ts.length, 72) }
    };
  }
  // endregion FUNC_metNormalize

  function metFetch(loc, opts) {
    var url = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=' +
      loc.lat + '&lon=' + loc.lon;
    return timedFetch(url, opts.fetcher, 'met')
      .then(function (r) { return checkResponse(r, 'met'); })
      .then(function (r) { return safeJson(r, 'met'); })
      .then(function (raw) { return metNormalize(raw, loc); });
  }

  // region FUNC_groupByLocalDay
  // @startcontract GROUP_BY_LOCAL_DAY
  // @brief Группировать ForecastPoint[] по локальным дням (граница = локальная полночь)
  // @keywords{GROUPING, TIMEZONE, FORECAST}
  // @invariant{Граница дня определяется через Intl в tz, не по UTC}
  // @param[in] points массив ForecastPoint
  // @param[in] tz IANA timezone
  // @return ForecastDay[] с dateLocalISO, weekdayRu, labelRu, points[]
  // @endcontract GROUP_BY_LOCAL_DAY
  function groupByLocalDay(points, tz) {
    var map = {};
    var order = [];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var dayKey;
      try {
        dayKey = new Intl.DateTimeFormat('en-CA', {
          year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz
        }).format(new Date(p.epochMs));
      } catch (_e) {
        dayKey = new Date(p.epochMs).toISOString().slice(0, 10);
      }
      if (!map[dayKey]) { map[dayKey] = []; order.push(dayKey); }
      map[dayKey].push(p);
    }
    return order.map(function (key) {
      var firstEp = map[key][0].epochMs;
      return {
        dateLocalISO: key,
        weekdayRu: Format.fmtDayLabel(firstEp, tz),
        labelRu: Format.fmtDayLabel(firstEp, tz),
        points: map[key]
      };
    });
  }
  // endregion FUNC_groupByLocalDay

  var _adapters = {
    openmeteo: { fetch: omFetch, normalize: omNormalize },
    wttr: { fetch: wttrFetch, normalize: wttrNormalize },
    met: { fetch: metFetch, normalize: metNormalize }
  };

  // @brief Получить адаптер по providerId @return адаптер или null
  function getAdapter(providerId) {
    return _adapters[providerId] || null;
  }

  // region FUNC_fetchForecast
  // @startcontract FETCH_FORECAST
  // @brief Диспетчер: получить прогноз через адаптер провайдера
  // @keywords{PROVIDER, DISPATCH, FORECAST}
  // @invariant{Бросает ProviderError при любой ошибке; не глотает}
  // @param[in] loc Location
  // @param[in] opts {fetcher, signal, providerId}
  // @return Promise<ForecastBundle>
  // @endcontract FETCH_FORECAST
  function fetchForecast(loc, opts) {
    var pid = opts.providerId || Config.DEFAULTS.providerId;
    var adapter = getAdapter(pid);
    if (!adapter) {
      return Promise.reject(new ProviderError(pid, 'network'));
    }
    Logger.info('FETCH_' + pid.toUpperCase(), 'start', 'loc=' + loc.id, 'ForecastBundle');
    return adapter.fetch(loc, opts).catch(function (err) {
      Logger.error('FETCH_' + pid.toUpperCase(), 'error',
        'kind=' + (err.kind || 'unknown'), 'ProviderError');
      throw err;
    });
  }
  // endregion FUNC_fetchForecast

  var Providers = {
    fetchForecast: fetchForecast,
    getAdapter: getAdapter,
    groupByLocalDay: groupByLocalDay,
    ProviderError: ProviderError,
    omNormalize: omNormalize,
    wttrNormalize: wttrNormalize,
    metNormalize: metNormalize
  };

  // endregion MOD_Providers

  // ================================================================
  // region MOD_Geo
  // Module 7: Geo — разрешение локации (forward/reverse geocoding, geolocation)
  // ================================================================

  var GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  var REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

  // region FUNC_normalizePlace
  // @startcontract NORMALIZE_PLACE
  // @brief Преобразовать сырой результат геокодинга → Location
  // @keywords{GEO, NORMALIZE, LOCATION}
  // @invariant{Результат всегда содержит timezone (IANA)}
  // @param[in] raw объект из Open-Meteo Geocoding
  // @return Location
  // @endcontract NORMALIZE_PLACE
  function normalizePlace(raw) {
    var lat = raw.latitude;
    var lon = raw.longitude;
    var tz = raw.timezone || 'UTC';
    return {
      id: lat.toFixed(3) + '_' + lon.toFixed(3),
      name: raw.name || '—',
      country: raw.country || null,
      admin: raw.admin1 || null,
      lat: lat, lon: lon, timezone: tz,
      displayName: raw.name || '—'
    };
  }
  // endregion FUNC_normalizePlace

  // region FUNC_searchPlaces
  // @startcontract SEARCH_PLACES
  // @brief Forward-геокодинг: поиск городов по строке
  // @keywords{GEO, SEARCH, GEOCODING}
  // @invariant{query санитизирован и ограничен SEARCH_MAX_LEN; fetcher injectable}
  // @param[in] query строка поиска
  // @param[in] opts {fetcher}
  // @return Promise<Location[]>
  // @endcontract SEARCH_PLACES
  function searchPlaces(query, opts) {
    var q = String(query || '').trim().slice(0, Config.SEARCH_MAX_LEN);
    if (q.length < 2) { return Promise.resolve([]); }
    var url = GEOCODE_URL + '?name=' + encodeURIComponent(q) + '&count=8&language=ru&format=json';
    var f = opts.fetcher || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    if (!f) { return Promise.resolve([]); }
    return f(url).then(function (r) {
      if (!r.ok) { return { results: [] }; }
      return r.json();
    }).then(function (data) {
      var results = (data.results || []).map(normalizePlace);
      Logger.info('GEO_FORWARD', 'results', 'query=' + q + ', count=' + results.length, 'Location[]');
      return results;
    }).catch(function () { return []; });
  }
  // endregion FUNC_searchPlaces

  // region FUNC_reverseGeocode
  // @startcontract REVERSE_GEOCODE
  // @brief Обратный геокодинг: координаты → имя + IANA timezone
  // @keywords{GEO, REVERSE, GEOCODING, TIMEZONE}
  // @invariant{Результат всегда содержит timezone; при отсутствии tz → UTC}
  // @param[in] lat широта
  // @param[in] lon долгота
  // @param[in] opts {fetcher}
  // @return Promise<Location>
  // @endcontract REVERSE_GEOCODE
  function reverseGeocode(lat, lon, opts) {
    var url = REVERSE_URL + '?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=ru';
    var f = opts.fetcher || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    if (!f) { return Promise.reject(new Error('no fetcher')); }
    return f(url).then(function (r) {
      if (!r.ok) { throw new Error('reverse geocode failed'); }
      return r.json();
    }).then(function (data) {
      var name = data.locality || data.city || data.principalSubdivision || '—';
      var tz = data.timezone ? (data.timezone.iana || data.timezone.name) : null;
      var loc = {
        id: lat.toFixed(3) + '_' + lon.toFixed(3),
        name: name, country: data.countryName || null,
        admin: data.principalSubdivision || null,
        lat: lat, lon: lon, timezone: tz || 'UTC', displayName: name
      };
      Logger.info('GEO_REVERSE', 'resolved', 'lat=' + lat + ', lon=' + lon + ', tz=' + loc.timezone, 'Location');
      return loc;
    });
  }
  // endregion FUNC_reverseGeocode

  // region FUNC_requestGeolocation
  // @startcontract REQUEST_GEOLOCATION
  // @brief Обёртка navigator.geolocation с таймаутом и нормализацией ошибок
  // @keywords{GEO, GEOLOCATION, BROWSER_API}
  // @invariant{При отказе/unsupported → reject с кодом, не crash}
  // @return Promise<{lat, lon}>
  // @endcontract REQUEST_GEOLOCATION
  function requestGeolocation() {
    return new Promise(function (resolve, reject) {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        Logger.warn('GEOLOC', 'denied', 'unsupported', '{lat, lon}');
        reject(new Error('geolocation_unsupported'));
        return;
      }
      var timer = setTimeout(function () {
        reject(new Error('geolocation_timeout'));
      }, Config.GEO_TIMEOUT_MS);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          clearTimeout(timer);
          Logger.info('GEOLOC', 'granted', 'lat=' + pos.coords.latitude, '{lat, lon}');
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        function (err) {
          clearTimeout(timer);
          Logger.warn('GEOLOC', 'denied', 'code=' + err.code, '{lat, lon}');
          reject(new Error('geolocation_denied'));
        },
        { timeout: Config.GEO_TIMEOUT_MS, maximumAge: 300000 }
      );
    });
  }
  // endregion FUNC_requestGeolocation

  var Geo = {
    searchPlaces: searchPlaces,
    reverseGeocode: reverseGeocode,
    requestGeolocation: requestGeolocation,
    normalizePlace: normalizePlace
  };

  // endregion MOD_Geo

  // ================================================================
  // region MOD_Cache
  // Module 9: Cache — app-level SWR state (in-memory + Storage)
  // ================================================================

  var _memCache = {};

  // @brief Синхронно получить последний успешный bundle @return bundle|null
  function cachePeek(key) {
    if (_memCache[key]) { return _memCache[key].bundle; }
    var stored = Storage.loadCache(key);
    if (stored && stored.bundle) {
      _memCache[key] = stored;
      return stored.bundle;
    }
    return null;
  }

  // @brief Зафиксировать успешный bundle (in-memory + Storage) @return void
  function cacheCommit(key, bundle) {
    _memCache[key] = { bundle: bundle, savedAt: Date.now() };
    Storage.saveCache(key, bundle);
  }

  // @brief Эвристика офлайна @return boolean
  function isProbablyOffline() {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return !navigator.onLine;
    }
    return false;
  }

  var Cache = {
    peek: cachePeek,
    commit: cacheCommit,
    isProbablyOffline: isProbablyOffline
  };

  // endregion MOD_Cache

  // ================================================================
  // region MOD_UI
  // Module 12: UI — рендер из нормализованной модели (безопасный, без innerHTML для данных провайдера)
  // ================================================================

  // @brief Безопасно создать DOM-элемент @return HTMLElement
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === 'className') { node.className = attrs[k]; }
        else if (k === 'textContent') { node.textContent = attrs[k]; }
        else { node.setAttribute(k, attrs[k]); }
      }
    }
    if (children) {
      for (var j = 0; j < children.length; j++) {
        var c = children[j];
        if (typeof c === 'string') { node.appendChild(document.createTextNode(c)); }
        else if (c) { node.appendChild(c); }
      }
    }
    return node;
  }

  // @brief Безопасно установить текст @return void
  function setText(node, value) {
    if (node) { node.textContent = value; }
  }

  // @brief Показать/скрыть элемент @return void
  function toggleVis(id, show) {
    var node = document.getElementById(id);
    if (node) { node.classList.toggle('visible', show); }
  }

  // region FUNC_renderShell
  // @startcontract RENDER_SHELL
  // @brief Инициализация app-shell: вставить иконки в кнопки
  // @keywords{UI, SHELL, ICONS}
  // @invariant{Иконки — статичные SVG из Module 4 (безопасно)}
  // @return void
  // @endcontract RENDER_SHELL
  function renderShell() {
    var geoBtn = document.getElementById('btn-geolocate');
    var setBtn = document.getElementById('btn-settings');
    var refBtn = document.getElementById('btn-refresh');
    var clsBtn = document.getElementById('btn-close-settings');
    var geoSetBtn = document.getElementById('btn-geo-settings');
    if (geoBtn) { geoBtn.innerHTML = Icons.uiIcon('geo'); }
    if (setBtn) { setBtn.innerHTML = Icons.uiIcon('gear'); }
    if (refBtn) { refBtn.innerHTML = Icons.uiIcon('refresh'); }
    if (clsBtn) { clsBtn.innerHTML = Icons.uiIcon('close'); }
    if (geoSetBtn) {
      var iconSpan = document.createElement('span');
      iconSpan.innerHTML = Icons.uiIcon('geo');
      geoSetBtn.insertBefore(iconSpan, geoSetBtn.firstChild);
    }
  }
  // endregion FUNC_renderShell

  // region FUNC_renderCurrent
  // @startcontract RENDER_CURRENT
  // @brief Рендер hero + 3 метрики + расширенный блок из ForecastBundle
  // @keywords{UI, RENDER, CURRENT}
  // @invariant{Данные вставляются через textContent (NC-2/S-9)}
  // @param[in] bundle ForecastBundle
  // @param[in] loc Location
  // @return void
  // @endcontract RENDER_CURRENT
  function renderCurrent(bundle, loc) {
    var cur = bundle.current;
    var tz = loc.timezone;
    setText(document.getElementById('city-name'), loc.displayName || loc.name);
    setText(document.getElementById('city-coords'), Format.fmtCoords(loc.lat, loc.lon));
    setText(document.getElementById('temp-value'), Format.fmtTempSigned(cur.tempC));
    setText(document.getElementById('hero-condition'), cur.conditionRu);
    setText(document.getElementById('metric-wind'), Format.fmtWind(cur.windSpeedMs));
    setText(document.getElementById('metric-humidity'), Format.fmtPct(cur.humidityPct));
    setText(document.getElementById('metric-precip'), Format.fmtPrecip(cur.precipMm));
    setText(document.getElementById('detail-feels'), Format.fmtTempSigned(cur.feelsLikeC) + '°');
    setText(document.getElementById('detail-pressure'), Format.fmtPressure(cur.pressureHPa));
    setText(document.getElementById('detail-uv'), cur.uvIndex != null ? String(cur.uvIndex) : '—');
    setText(document.getElementById('detail-sun'),
      (cur.sunrise && cur.sunset)
        ? Format.fmtTimeHM(cur.sunrise, tz) + ' / ' + Format.fmtTimeHM(cur.sunset, tz)
        : '—');
    Logger.info('RENDER', 'current', 'temp=' + cur.tempC, 'void');
  }
  // endregion FUNC_renderCurrent

  // region FUNC_renderChart
  // @startcontract RENDER_CHART
  // @brief Рендер почасового SVG-графика (линия + заливка + подписи + иконки)
  // @keywords{UI, RENDER, CHART, SVG}
  // @invariant{SVG строится из числовых данных и статичных иконок Module 4 (безопасно)}
  // @param[in] bundle ForecastBundle
  // @param[in] loc Location (для tz)
  // @return void
  // @endcontract RENDER_CHART
  function renderChart(bundle, loc) {
    var container = document.getElementById('chart-scroll');
    if (!container) { return; }
    var points = [];
    var days = bundle.days || [];
    for (var d = 0; d < days.length; d++) {
      for (var p = 0; p < days[d].points.length; p++) {
        points.push(days[d].points[p]);
      }
    }
    // График: с текущего часа (включая текущий)
    var chartStart = Date.now() - 60 * 60 * 1000;
    var show = points.filter(function (pt) { return pt.epochMs >= chartStart; }).slice(0, 24);
    if (show.length < 2) { container.innerHTML = ''; return; }
    var W = show.length * 64;
    var H = 160;
    var padT = 28;
    var padB = 44;
    var temps = show.map(function (pt) { return pt.tempC; });
    var minT = Math.min.apply(null, temps);
    var maxT = Math.max.apply(null, temps);
    var range = Math.max(maxT - minT, 1);
    var coords = show.map(function (pt, i) {
      var x = 32 + i * 64;
      var y = padT + (1 - (pt.tempC - minT) / range) * (H - padT - padB);
      return { x: x, y: y, pt: pt };
    });
    // Плавные кривые (Catmull-Rom → cubic Bezier)
    var curveSegs = '';
    for (var ci = 0; ci < coords.length - 1; ci++) {
      var p0 = coords[ci - 1] || coords[ci];
      var p1 = coords[ci];
      var p2 = coords[ci + 1];
      var p3 = coords[ci + 2] || coords[ci + 1];
      var cp1x = p1.x + (p2.x - p0.x) / 6;
      var cp1y = p1.y + (p2.y - p0.y) / 6;
      var cp2x = p2.x - (p3.x - p1.x) / 6;
      var cp2y = p2.y - (p3.y - p1.y) / 6;
      curveSegs += ' C' + cp1x.toFixed(1) + ',' + cp1y.toFixed(1) + ' ' +
        cp2x.toFixed(1) + ',' + cp2y.toFixed(1) + ' ' + p2.x + ',' + p2.y;
    }
    var linePath = 'M' + coords[0].x + ',' + coords[0].y + curveSegs;
    var areaPath = 'M' + coords[0].x + ',' + (H - padB) +
      ' L' + coords[0].x + ',' + coords[0].y + curveSegs +
      ' L' + coords[coords.length - 1].x + ',' + (H - padB) + ' Z';
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="cfill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--chart-fill-from)"/>' +
      '<stop offset="100%" stop-color="var(--chart-fill-to)"/>' +
      '</linearGradient></defs>' +
      '<path d="' + areaPath + '" fill="url(#cfill)"/>' +
      '<path class="chart-line-path" d="' + linePath +
      '" fill="none" stroke="var(--chart-line)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    for (var i = 0; i < coords.length; i++) {
      var c = coords[i];
      svg += '<circle cx="' + c.x + '" cy="' + c.y + '" r="3" fill="var(--chart-line)"/>';
      svg += '<text x="' + c.x + '" y="' + (c.y - 8) +
        '" text-anchor="middle" font-size="13" font-family="var(--font-mono)" fill="var(--ink)">' +
        Format.fmtTempSigned(c.pt.tempC) + '</text>';
      svg += '<text x="' + c.x + '" y="' + (H - padB + 16) +
        '" text-anchor="middle" font-size="12" fill="var(--muted)">' +
        Format.fmtTimeHM(c.pt.epochMs, loc.timezone) + '</text>';
      svg += '<g transform="translate(' + (c.x - 8) + ',' + (H - padB + 20) + ')">' +
        Icons.weatherIcon(c.pt.iconId, 16) + '</g>';
    }
    svg += '</svg>';
    container.innerHTML = svg;
    Logger.info('RENDER', 'chart', 'points=' + show.length, 'void');
  }
  // endregion FUNC_renderChart

  // region FUNC_renderTable
  // @startcontract RENDER_TABLE
  // @brief Рендер почасовой таблицы по локальным дням (безопасный, без innerHTML для данных)
  // @keywords{UI, RENDER, TABLE}
  // @invariant{Данные провайдера вставляются через textContent; иконки — из Module 4}
  // @param[in] bundle ForecastBundle
  // @param[in] loc Location
  // @return void
  // @endcontract RENDER_TABLE
  function renderTable(bundle, loc) {
    var container = document.getElementById('table-section');
    if (!container) { return; }
    container.innerHTML = '';
    var days = bundle.days || [];
    // Таблица: только будущие часы (исключая текущий)
    var tableStart = Date.now();
    for (var d = 0; d < days.length; d++) {
      var day = days[d];
      var futurePts = day.points.filter(function (pt) { return pt.epochMs > tableStart; });
      if (futurePts.length === 0) { continue; }
      var header = el('div', { className: 'day-header', textContent: day.labelRu });
      container.appendChild(header);
      for (var i = 0; i < futurePts.length; i++) {
        container.appendChild(_buildHourRow(futurePts[i], loc.timezone));
      }
    }
    Logger.info('RENDER', 'table', 'days=' + days.length, 'void');
  }
  // endregion FUNC_renderTable

  // @brief Построить строку почасовой таблицы (безопасно) @return HTMLElement
  function _buildHourRow(pt, tz) {
    var row = el('div', { className: 'hour-row' });
    row.appendChild(el('span', { className: 'hour-time', textContent: Format.fmtTimeHM(pt.epochMs, tz) }));
    var iconCell = el('span', { className: 'hour-icon' });
    iconCell.innerHTML = Icons.weatherIcon(pt.iconId, 18);
    row.appendChild(iconCell);
    row.appendChild(el('span', { className: 'hour-temp', textContent: Format.fmtTempSigned(pt.tempC) + '°' }));
    var windCell = el('span', { className: 'hour-wind' });
    var arrowSpan = el('span', { className: 'wind-arrow' });
    arrowSpan.innerHTML = Icons.windArrow(pt.windDirDeg, 18);
    windCell.appendChild(arrowSpan);
    windCell.appendChild(document.createTextNode(Format.fmtWind(pt.windSpeedMs)));
    row.appendChild(windCell);
    row.appendChild(el('span', { className: 'hour-humidity', textContent: Format.fmtPct(pt.humidityPct) }));
    row.appendChild(el('span', { className: 'hour-precip', textContent: Format.fmtPrecip(pt.precipMm) }));
    return row;
  }

  // @brief Рендер индикатора обновления @return void
  function renderUpdated(at, loading) {
    var textEl = document.getElementById('update-text');
    var spinner = document.getElementById('spinner');
    if (loading) {
      setText(textEl, STR.loading);
      if (spinner) { spinner.classList.add('active'); }
    } else {
      setText(textEl, at ? Format.fmtUpdatedAt(at) : '');
      if (spinner) { spinner.classList.remove('active'); }
    }
  }

  // --- Состояния (FR-STATE-*) ---

  // @brief Показать скелетон, скрыть контент @return void
  function showSkeleton() {
    _showState('state-skeleton');
  }

  // @brief Показать empty-state @return void
  function showEmpty() {
    _showState('state-empty');
    Logger.info('CACHE_MISS', 'empty', '', 'empty-state');
  }

  // @brief Показать ошибку @return void
  function showError(msg) {
    setText(document.getElementById('error-message'), msg || STR.errorNetwork);
    _showState('state-error');
  }

  // @brief Показать «ничего не найдено» в поиске @return void
  function showNoResults() {
    var nr = document.getElementById('no-results');
    if (nr) { nr.classList.remove('hidden'); }
  }

  // @brief Скрыть «ничего не найдено» @return void
  function hideNoResults() {
    var nr = document.getElementById('no-results');
    if (nr) { nr.classList.add('hidden'); }
  }

  // @brief Показать geolocation denied @return void
  function showGeoDenied() {
    _showState('state-geo-denied');
  }

  // @brief Показать/скрыть офлайн-бейдж @return void
  function setOfflineBadge(on) {
    toggleVis('offline-badge', on);
  }

  // @brief Переключить видимость состояния и основного контента @return void
  function _showState(stateId) {
    var states = ['state-skeleton', 'state-empty', 'state-error', 'state-geo-denied'];
    for (var i = 0; i < states.length; i++) {
      toggleVis(states[i], states[i] === stateId);
    }
    var main = document.getElementById('main-content');
    if (main) { main.style.display = stateId ? 'none' : ''; }
  }

  // @brief Скрыть все состояния, показать контент @return void
  function hideAllStates() {
    _showState(null);
  }

  var UI = {
    el: el,
    setText: setText,
    renderShell: renderShell,
    renderCurrent: renderCurrent,
    renderChart: renderChart,
    renderTable: renderTable,
    renderUpdated: renderUpdated,
    showSkeleton: showSkeleton,
    showEmpty: showEmpty,
    showError: showError,
    showNoResults: showNoResults,
    hideNoResults: hideNoResults,
    showGeoDenied: showGeoDenied,
    setOfflineBadge: setOfflineBadge,
    hideAllStates: hideAllStates
  };

  // endregion MOD_UI

  // ================================================================
  // region MOD_Theme
  // Module 10: Theme — применение скина через data-theme
  // ================================================================

  var Theme = {
    // @brief Применить скин @return void
    apply: function (themeId) {
      document.documentElement.setAttribute('data-theme', themeId);
      Logger.info('THEME_APPLY', 'applied', 'theme=' + themeId, 'void');
    },
    // @brief Текущий скин @return строка themeId
    current: function () {
      return document.documentElement.getAttribute('data-theme') || Config.DEFAULTS.themeId;
    }
  };

  // endregion MOD_Theme

  // ================================================================
  // region MOD_Refresh
  // Module 11: Refresh — таймер автообновления + Page Visibility
  // ================================================================

  var _refTimer = null;
  var _refIntervalMs = 0;
  var _refOnTick = null;
  var _refLastAt = 0;
  var _refPaused = false;

  // region FUNC_refStart
  // @startcontract REF_START
  // @brief Запустить таймер автообновления
  // @keywords{REFRESH, TIMER}
  // @invariant{Интервал >= REFRESH_MIN; 0 = выкл (таймер не ставится)}
  // @param[in] min интервал в минутах (0 = выкл)
  // @param[in] onTick колбэк обновления
  // @return void
  // @endcontract REF_START
  function refStart(min, onTick) {
    refStop();
    _refOnTick = onTick;
    if (!min || min < Config.REFRESH_MIN) {
      if (min !== 0) { min = Config.DEFAULTS.autoRefreshMin; }
    }
    if (min === 0) { return; }
    _refIntervalMs = min * 60000;
    _refTimer = setInterval(function () {
      Logger.info('REFRESH_TICK', 'fire', 'interval=' + min + 'min', 'void');
      if (_refOnTick) { _refOnTick(); }
    }, _refIntervalMs);
  }
  // endregion FUNC_refStart

  // @brief Остановить таймер @return void
  function refStop() {
    if (_refTimer) { clearInterval(_refTimer); _refTimer = null; }
  }

  // @brief Ручное обновление @return void
  function refRefreshNow() {
    if (_refOnTick) { _refOnTick(); }
  }

  // @brief Пауза (скрытая вкладка) @return void
  function refPause() {
    _refPaused = true;
    refStop();
    Logger.info('REFRESH_PAUSE', 'hidden', '', 'void');
  }

  // region FUNC_refResume
  // @startcontract REF_RESUME
  // @brief Возобновление (видимая вкладка); немедленный tick если интервал истёк
  // @keywords{REFRESH, VISIBILITY}
  // @invariant{Если now - lastSuccess >= interval → немедленный refreshActive}
  // @return void
  // @endcontract REF_RESUME
  function refResume() {
    _refPaused = false;
    Logger.info('REFRESH_PAUSE', 'visible', '', 'void');
    if (_refIntervalMs > 0) {
      var elapsed = Date.now() - _refLastAt;
      if (elapsed >= _refIntervalMs && _refOnTick) {
        _refOnTick();
      }
      _refTimer = setInterval(function () {
        Logger.info('REFRESH_TICK', 'fire', '', 'void');
        if (_refOnTick) { _refOnTick(); }
      }, _refIntervalMs);
    }
  }
  // endregion FUNC_refResume

  var Refresh = {
    start: refStart,
    stop: refStop,
    refreshNow: refRefreshNow,
    pause: refPause,
    resume: refResume,
    markSuccess: function () { _refLastAt = Date.now(); }
  };

  // endregion MOD_Refresh

  // ================================================================
  // region MOD_Settings
  // Module 13: Settings — панель настроек (провайдер/локация/интервал/скин)
  // ================================================================

  var _settingsOpen = false;
  var _searchTimer = null;
  var _onSettingsChange = null;

  // @brief Открыть панель настроек @return void
  function settingsOpen() {
    _settingsOpen = true;
    document.getElementById('settings-backdrop').classList.add('open');
    document.getElementById('settings-panel').classList.add('open');
    _renderProviderOptions();
    _renderRefreshOptions();
    _renderThemeOptions();
    _renderRecents();
  }

  // @brief Закрыть панель настроек @return void
  function settingsClose() {
    _settingsOpen = false;
    document.getElementById('settings-backdrop').classList.remove('open');
    document.getElementById('settings-panel').classList.remove('open');
  }

  // region FUNC_settingsBind
  // @startcontract SETTINGS_BIND
  // @brief Привязать обработчики событий панели настроек
  // @keywords{SETTINGS, EVENTS, BIND}
  // @invariant{Все изменения → persist + колбэк onSettingsChange}
  // @param[in] onChange колбэк при изменении настроек
  // @return void
  // @endcontract SETTINGS_BIND
  function settingsBind(onChange) {
    _onSettingsChange = onChange;
    document.getElementById('btn-settings').addEventListener('click', settingsOpen);
    document.getElementById('btn-close-settings').addEventListener('click', settingsClose);
    document.getElementById('settings-backdrop').addEventListener('click', settingsClose);
    document.getElementById('btn-empty-settings').addEventListener('click', settingsOpen);
    // Поиск локации с дебаунсом
    var searchInput = document.getElementById('location-search');
    searchInput.addEventListener('input', function () {
      clearTimeout(_searchTimer);
      var q = searchInput.value;
      _searchTimer = setTimeout(function () { _doSearch(q); }, Config.SEARCH_DEBOUNCE_MS);
    });
    // Геолокация из настроек
    document.getElementById('btn-geo-settings').addEventListener('click', _doGeolocate);
    // Геолокация из шапки
    document.getElementById('btn-geolocate').addEventListener('click', _doGeolocate);
    // Кнопки состояний
    document.getElementById('btn-retry').addEventListener('click', function () {
      UI.hideAllStates();
      if (_onSettingsChange) { _onSettingsChange({ retry: true }); }
    });
    document.getElementById('btn-geo-search').addEventListener('click', settingsOpen);
    // Ручное обновление
    document.getElementById('btn-refresh').addEventListener('click', function () {
      Refresh.refreshNow();
    });
  }
  // endregion FUNC_settingsBind

  // @brief Рендер radio-кнопок провайдеров @return void
  function _renderProviderOptions() {
    var container = document.getElementById('provider-options');
    container.innerHTML = '';
    var settings = Storage.loadSettings();
    Config.PROVIDERS.forEach(function (p) {
      var label = UI.el('label', { className: 'settings-option' + (settings.providerId === p.id ? ' selected' : '') });
      var radio = UI.el('input', { type: 'radio', name: 'provider', value: p.id });
      if (settings.providerId === p.id) { radio.checked = true; }
      radio.addEventListener('change', function () {
        var s = Storage.loadSettings();
        s.providerId = p.id;
        Storage.saveSettings(s);
        _renderProviderOptions();
        if (_onSettingsChange) { _onSettingsChange({ providerId: p.id }); }
      });
      label.appendChild(radio);
      label.appendChild(document.createTextNode(p.name));
      container.appendChild(label);
    });
  }

  // @brief Рендер radio-кнопок интервала @return void
  function _renderRefreshOptions() {
    var container = document.getElementById('refresh-options');
    container.innerHTML = '';
    var settings = Storage.loadSettings();
    Config.REFRESH_PRESETS.forEach(function (min) {
      var labelText = min === 0 ? STR.off : min + ' ' + STR.minShort;
      var label = UI.el('label', { className: 'settings-option' + (settings.autoRefreshMin === min ? ' selected' : '') });
      var radio = UI.el('input', { type: 'radio', name: 'refresh', value: String(min) });
      if (settings.autoRefreshMin === min) { radio.checked = true; }
      radio.addEventListener('change', function () {
        var s = Storage.loadSettings();
        s.autoRefreshMin = min;
        Storage.saveSettings(s);
        _renderRefreshOptions();
        if (_onSettingsChange) { _onSettingsChange({ autoRefreshMin: min }); }
      });
      label.appendChild(radio);
      label.appendChild(document.createTextNode(labelText));
      container.appendChild(label);
    });
  }

  // @brief Рендер radio-кнопок скинов @return void
  function _renderThemeOptions() {
    var container = document.getElementById('theme-options');
    container.innerHTML = '';
    var settings = Storage.loadSettings();
    var themes = [
      { id: 'paper-fir', name: STR.themeFir },
      { id: 'paper-night', name: STR.themeNight },
      { id: 'paper-cool', name: STR.themeCool }
    ];
    themes.forEach(function (t) {
      var label = UI.el('label', { className: 'settings-option' + (settings.themeId === t.id ? ' selected' : '') });
      var radio = UI.el('input', { type: 'radio', name: 'theme', value: t.id });
      if (settings.themeId === t.id) { radio.checked = true; }
      radio.addEventListener('change', function () {
        var s = Storage.loadSettings();
        s.themeId = t.id;
        Storage.saveSettings(s);
        Theme.apply(t.id);
        _renderThemeOptions();
      });
      label.appendChild(radio);
      label.appendChild(document.createTextNode(t.name));
      container.appendChild(label);
    });
  }

  // @brief Рендер списка недавних локаций @return void
  function _renderRecents() {
    var container = document.getElementById('recent-list');
    container.innerHTML = '';
    var recents = Storage.loadRecents();
    recents.forEach(function (loc) {
      var item = UI.el('li', { className: 'recent-item', textContent: loc.displayName || loc.name });
      item.addEventListener('click', function () { _selectLocation(loc); });
      container.appendChild(item);
    });
  }

  // region FUNC_doSearch
  // @startcontract DO_SEARCH
  // @brief Выполнить поиск города и отрендерить результаты
  // @keywords{SETTINGS, SEARCH, GEO}
  // @invariant{Дебаунс уже применён вызывающим кодом}
  // @param[in] query строка поиска
  // @return void
  // @endcontract DO_SEARCH
  function _doSearch(query) {
    var resultsEl = document.getElementById('search-results');
    resultsEl.innerHTML = '';
    UI.hideNoResults();
    if (!query || query.trim().length < 2) { return; }
    Geo.searchPlaces(query, {}).then(function (results) {
      resultsEl.innerHTML = '';
      if (results.length === 0) {
        UI.showNoResults();
        return;
      }
      UI.hideNoResults();
      results.forEach(function (loc) {
        var item = UI.el('li', { className: 'search-result-item', role: 'option' });
        item.appendChild(UI.el('div', { className: 'search-result-name', textContent: loc.name }));
        var sub = [loc.admin, loc.country].filter(Boolean).join(', ');
        if (sub) { item.appendChild(UI.el('div', { className: 'search-result-sub', textContent: sub })); }
        item.addEventListener('click', function () { _selectLocation(loc); });
        resultsEl.appendChild(item);
      });
    });
  }
  // endregion FUNC_doSearch

  // @brief Обработать геолокацию @return void
  function _doGeolocate() {
    Geo.requestGeolocation().then(function (pos) {
      return Geo.reverseGeocode(pos.lat, pos.lon, {});
    }).then(function (loc) {
      _selectLocation(loc);
    }).catch(function () {
      UI.showGeoDenied();
      settingsClose();
    });
  }

  // @brief Выбрать локацию: сохранить, закрыть, колбэк @return void
  function _selectLocation(loc) {
    Storage.saveLocation(loc);
    Storage.pushRecent(loc);
    settingsClose();
    if (_onSettingsChange) { _onSettingsChange({ locationId: loc.id }); }
  }

  var Settings = {
    open: settingsOpen,
    close: settingsClose,
    bind: settingsBind
  };

  // endregion MOD_Settings

  // ================================================================
  // region MOD_Bootstrap
  // Module 14: App / Bootstrap — оркестрация запуска и связывание модулей
  // ================================================================

  // region FUNC_refreshActive
  // @startcontract REFRESH_ACTIVE
  // @brief Тихое обновление: fetch → commit → render; при ошибке — showError поверх кэша
  // @keywords{BOOTSTRAP, FETCH, RENDER}
  // @invariant{При ошибке данные НЕ стираются; кэш остаётся валидным}
  // @return void
  // @endcontract REFRESH_ACTIVE
  function refreshActive() {
    var loc = Storage.loadLocation();
    if (!loc) { return; }
    var settings = Storage.loadSettings();
    UI.renderUpdated(null, true);
    Providers.fetchForecast(loc, {
      fetcher: typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null,
      providerId: settings.providerId
    }).then(function (bundle) {
      var key = Storage.cacheKey(loc, settings.providerId);
      Cache.commit(key, bundle);
      UI.hideAllStates();
      UI.renderCurrent(bundle, loc);
      UI.renderChart(bundle, loc);
      UI.renderTable(bundle, loc);
      UI.renderUpdated(Date.now(), false);
      UI.setOfflineBadge(false);
      Refresh.markSuccess();
    }).catch(function (err) {
      Logger.error('ERROR', 'provider', 'kind=' + (err.kind || 'unknown'), 'void');
      var msg = STR.errorNetwork;
      if (err.kind === 'forbidden') { msg = STR.errorForbidden; }
      else if (err.kind === 'parse') { msg = STR.errorParse; }
      else if (err.kind === 'http') { msg = STR.errorProvider; }
      UI.showError(msg);
      UI.setOfflineBadge(Cache.isProbablyOffline());
      UI.renderUpdated(null, false);
    });
  }
  // endregion FUNC_refreshActive

  // region FUNC_loadAndRenderCached
  // @startcontract LOAD_AND_RENDER_CACHED
  // @brief Cold start: рендер из кэша (если есть) + тихое обновление
  // @keywords{BOOTSTRAP, CACHE, COLD_START}
  // @invariant{При кэше — мгновенный рендер; при отсутствии — empty-state}
  // @return void
  // @endcontract LOAD_AND_RENDER_CACHED
  function loadAndRenderCached() {
    var loc = Storage.loadLocation();
    if (!loc) {
      UI.showEmpty();
      return;
    }
    var settings = Storage.loadSettings();
    var key = Storage.cacheKey(loc, settings.providerId);
    var bundle = Cache.peek(key);
    if (bundle) {
      Logger.info('CACHE_HIT', 'render', 'key=' + key, 'void');
      UI.hideAllStates();
      UI.renderCurrent(bundle, loc);
      UI.renderChart(bundle, loc);
      UI.renderTable(bundle, loc);
      var stored = Storage.loadCache(key);
      UI.renderUpdated(stored ? stored.savedAt : null, false);
      UI.setOfflineBadge(Cache.isProbablyOffline());
    } else {
      UI.showSkeleton();
    }
    refreshActive();
  }
  // endregion FUNC_loadAndRenderCached

  // @brief Обработчик изменений настроек @return void
  function onSettingsChange(diff) {
    if (diff.retry) { refreshActive(); return; }
    if (diff.locationId || diff.providerId) {
      UI.showSkeleton();
      refreshActive();
    }
    if (typeof diff.autoRefreshMin === 'number') {
      var settings = Storage.loadSettings();
      Refresh.start(settings.autoRefreshMin, refreshActive);
    }
  }

  // region FUNC_registerSW
  // @startcontract REGISTER_SW
  // @brief Регистрация Service Worker (guarded: только secure context)
  // @keywords{PWA, SERVICE_WORKER, GUARD}
  // @invariant{На file:// / без isSecureContext — пропускается с belief-логом}
  // @return void
  // @endcontract REGISTER_SW
  function registerSW() {
    if (typeof window === 'undefined') { return; }
    if (!window.isSecureContext || !('serviceWorker' in navigator)) {
      Logger.info('SW_REGISTER', 'skipped', 'not secure context', 'void');
      return;
    }
    try {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        Logger.info('SW_REGISTER', 'registered', '', 'void');
        // Авто-prompt перезагрузки при обнаружении нового воркера
        reg.addEventListener('updatefound', function () {
          var newSW = reg.installing;
          if (!newSW) { return; }
          newSW.addEventListener('statechange', function () {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              // Новый воркер установлен → страница контролируется старым → reload
              Logger.info('SW_UPDATE', 'installed', '', 'reload');
              window.location.reload();
            }
          });
        });
        // Принудительная проверка обновления при каждом запуске
        reg.update();
      }).catch(function (err) {
        Logger.warn('SW_REGISTER', 'skipped', 'error=' + err.message, 'void');
      });
      // Слушаем событие 'controllerchange' (новый SW активирован)
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        window.location.reload();
      });
    } catch (e) {
      Logger.warn('SW_REGISTER', 'skipped', 'exception', 'void');
    }
  }
  // endregion FUNC_registerSW

  // region FUNC_boot
  // @startcontract BOOT
  // @brief Оркестрация запуска приложения
  // @keywords{BOOTSTRAP, INIT}
  // @invariant{Не падает при недоступном localStorage/SW/file://}
  // @return void
  // @endcontract BOOT
  function boot() {
    Logger.info('BOOT', 'started', '', 'app initialized');
    try {
      var settings = Storage.loadSettings();
      Theme.apply(settings.themeId);
      UI.renderShell();
      Settings.bind(onSettingsChange);
      loadAndRenderCached();
      Refresh.start(settings.autoRefreshMin, refreshActive);
      // Page Visibility (FR-REF-4)
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') { Refresh.pause(); }
        else { Refresh.resume(); }
      });
      registerSW();
    } catch (e) {
      Logger.error('BOOT', 'failed', 'error=' + e.message, 'void');
    }
  }
  // endregion FUNC_boot

  // endregion MOD_Bootstrap

  // ================================================================
  // UMD-экспорт (D-UMD): только DOM-независимое + __boot
  // ================================================================
  return {
    Logger: Logger,
    Config: Config,
    I18n: I18n,
    Format: Format,
    Icons: Icons,
    Conditions: Conditions,
    Storage: Storage,
    Geo: Geo,
    Providers: Providers,
    Cache: Cache,
    ProviderError: ProviderError,
    groupByLocalDay: groupByLocalDay,
    cacheKey: Storage.cacheKey,
    calcSunTimes: calcSunTimes,
    // UI (Module 12) — DOM-зависимый, не экспортируется в UMD
    __boot: boot
  };
});
