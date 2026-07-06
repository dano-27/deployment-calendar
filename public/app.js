(function () {
  'use strict';

  // ==================== API CLIENT ====================
  const API = {
    async getEvents(month, year) {
      const res = await fetch(`/api/events?month=${month}&year=${year}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json();
    },

    async createEvent(data) {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create event');
      return res.json();
    },

    async updateEvent(id, data) {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update event');
      return res.json();
    },

    async deleteEvent(id) {
      const res = await fetch(`/api/events/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete event');
      return res.json();
    },

    async getCategories() {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },

    async createCategory(data) {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create category');
      return res.json();
    },

    async updateCategory(id, data) {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update category');
      return res.json();
    },

    async deleteCategory(id) {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete category');
      return res.json();
    },

    // Items
    async getItems() {
      const res = await fetch('/api/items');
      if (!res.ok) throw new Error('Failed to fetch items');
      return res.json();
    },

    async createItem(data) {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create item');
      return res.json();
    },

    async deleteItem(id) {
      const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete item');
      return res.json();
    },
  };

  // ==================== MONTH NAMES ====================
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ==================== STATE ====================
  let currentMonth = new Date().getMonth();   // 0-11
  let currentYear = new Date().getFullYear();
  let currentView = 'month';                 // 'month' | 'week' | 'day'
  let currentWeekStart = null;               // Date object: Monday of current week
  let currentDay = null;                     // Date object: current day in day view
  let events = [];
  let categories = [];
  let presetItems = [];      // preset equipment items library
  let modalItems = [];       // temp items assigned in the modal [{itemId, itemName, quantity}]
  let selectedDate = null;   // 'YYYY-MM-DD'
  let editingEvent = null;   // event object or null
  let draggedEventId = null; // ID of the event being dragged

  // ==================== DOM REFERENCES ====================
  let $monthYearDisplay;
  let $prevMonthBtn;
  let $nextMonthBtn;
  let $todayBtn;
  let $calendarGrid;
  let $categoryLegend;
  let $manageCategoriesBtn;

  // Event modal
  let $eventModal;
  let $eventModalTitle;
  let $eventModalDate;
  let $eventTitle;
  let $eventDetails;
  let $eventCategory;
  let $eventStatus;
  let $eventStatusDate;
  let $statusDateGroup;
  let $eventBackupStock;
  let $saveEventBtn;
  let $deleteEventBtn;
  let $cancelEventBtn;

  // Category modal
  let $categoryModal;
  let $categoryList;
  let $newCategoryName;
  let $newCategoryColor;
  let $addCategoryBtn;
  let $closeCategoryModalBtn;

  // Filters
  let $filterCategory;
  let $filterStatus;
  let $filterDateFrom;
  let $filterDateTo;
  let $clearFiltersBtn;
  let $filterCount;
  let $filterBackupStock;

  // Item picker (in event modal)
  let $itemPickerSelect;
  let $itemPickerQty;
  let $itemPickerAddBtn;
  let $assignedItemsList;

  // Items modal
  let $itemsModal;
  let $itemsList;
  let $newItemName;
  let $addItemBtn;
  let $closeItemsModalBtn;
  let $manageItemsBtn;

  // ==================== UTILITY ====================

  /**
   * Pad a number with a leading zero if needed.
   * @param {number} n
   * @returns {string}
   */
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /**
   * Format a date string (YYYY-MM-DD) into a human-readable format.
   * e.g. "Wednesday, July 15, 2026"
   * @param {string} dateStr
   * @returns {string}
   */
  function formatDateNice(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayName = DAY_NAMES[dateObj.getDay()];
    const monthName = MONTH_NAMES[m - 1];
    return `${dayName}, ${monthName} ${d}, ${y}`;
  }

  /**
   * Get today's date as YYYY-MM-DD.
   * @returns {string}
   */
  function todayStr() {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /**
   * Convert a Date object to YYYY-MM-DD string.
   */
  function dateToStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /**
   * Get the Monday of the week containing the given date.
   */
  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  // ==================== CALENDAR ENGINE ====================

  /**
   * Build and render the entire calendar grid for the current month/year.
   */
  function renderCalendar() {

    const year = currentYear;
    const month = currentMonth; // 0-indexed

    // First day of the month (0=Sun, 1=Mon, ... 6=Sat)
    const firstDayRaw = new Date(year, month, 1).getDay();
    // Convert to Monday-start: Monday=0, Tuesday=1, ..., Sunday=6
    const firstDayOffset = (firstDayRaw + 6) % 7;

    // Number of days in this month
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Number of days in previous month (for leading overflow)
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // Calculate total cells needed (always fill complete weeks)
    const totalCells = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7;

    const today = todayStr();

    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement('div');
      cell.classList.add('day-cell');

      let dayNum, dateStr, isOtherMonth = false;

      if (i < firstDayOffset) {
        // Previous month overflow
        dayNum = daysInPrevMonth - firstDayOffset + 1 + i;
        const prevMonth = month === 0 ? 12 : month;
        const prevYear = month === 0 ? year - 1 : year;
        dateStr = `${prevYear}-${pad(prevMonth)}-${pad(dayNum)}`;
        isOtherMonth = true;
      } else if (i >= firstDayOffset + daysInMonth) {
        // Next month overflow
        dayNum = i - firstDayOffset - daysInMonth + 1;
        const nextMonth = month === 11 ? 1 : month + 2;
        const nextYear = month === 11 ? year + 1 : year;
        dateStr = `${nextYear}-${pad(nextMonth)}-${pad(dayNum)}`;
        isOtherMonth = true;
      } else {
        // Current month
        dayNum = i - firstDayOffset + 1;
        dateStr = `${year}-${pad(month + 1)}-${pad(dayNum)}`;
      }

      // Add classes
      if (isOtherMonth) {
        cell.classList.add('other-month');
      }

      // Weekend check: columns 5 (Saturday) and 6 (Sunday) in Monday-start grid
      const colIndex = i % 7;
      if (colIndex === 5 || colIndex === 6) {
        cell.classList.add('weekend');
      }

      // Today check
      if (dateStr === today) {
        cell.classList.add('today');
      }

      // Day number
      const dayNumberEl = document.createElement('div');
      dayNumberEl.classList.add('day-number');
      dayNumberEl.textContent = dayNum;
      cell.appendChild(dayNumberEl);

      // Events container
      const eventsContainer = document.createElement('div');
      eventsContainer.classList.add('day-events');
      cell.appendChild(eventsContainer);

      // Render events for this date
      renderEventsInCell(eventsContainer, dateStr);

      // Hover "+" hint
      const addHint = document.createElement('div');
      addHint.classList.add('add-event-hint');
      addHint.textContent = '+';
      cell.appendChild(addHint);

      // Click handler — open modal for new event on this date
      if (!isOtherMonth) {
        cell.addEventListener('click', function () {
          openEventModal(dateStr);
        });
      }

      // ---- Drag-and-drop: make day cells valid drop targets ----
      cell.dataset.date = dateStr;
      addDropHandlers(cell, isOtherMonth);

      $calendarGrid.appendChild(cell);
    }
  }

  /**
   * Render event cards inside a day cell for a specific date.
   * @param {HTMLElement} container
   * @param {string} date - YYYY-MM-DD
   */
  function renderEventsInCell(container, date) {
    const dayEvents = events.filter(function (ev) {
      return ev.date === date;
    });

    dayEvents.forEach(function (ev) {
      const card = document.createElement('div');
      card.classList.add('event-card');

      // Make the card draggable
      card.setAttribute('draggable', 'true');
      card.dataset.eventId = ev.id;
      card.dataset.eventDate = date;

      // Drag start — store the event ID and add dragging visual state
      card.addEventListener('dragstart', function (e) {
        draggedEventId = ev.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ev.id);
        // Add a slight delay so the drag ghost renders before we dim the card
        setTimeout(function () {
          card.classList.add('dragging');
        }, 0);
      });

      // Drag end — clean up visual state
      card.addEventListener('dragend', function () {
        card.classList.remove('dragging');
        draggedEventId = null;
        // Remove any lingering drag-over highlights
        document.querySelectorAll('.day-cell.drag-over').forEach(function (cell) {
          cell.classList.remove('drag-over');
        });
      });

      // Set border-left color from category
      const catColor = ev.categoryColor || 'var(--accent-blue)';
      card.style.borderLeftColor = catColor;

      // Title
      const titleEl = document.createElement('div');
      titleEl.classList.add('event-title');
      titleEl.textContent = ev.title;
      card.appendChild(titleEl);

      // Items (if any)
      if (ev.items && ev.items.length > 0) {
        const itemsEl = document.createElement('div');
        itemsEl.classList.add('event-items');
        itemsEl.textContent = ev.items.map(function (it) {
          return it.quantity + '× ' + it.itemName;
        }).join(', ');
        card.appendChild(itemsEl);
      }

      // Details / notes (if present)
      if (ev.details && ev.details.trim()) {
        const detailsEl = document.createElement('div');
        detailsEl.classList.add('event-details');
        detailsEl.textContent = ev.details;
        card.appendChild(detailsEl);
      }

      // Status indicator
      if (ev.status && ev.status !== 'pending') {
        const statusEl = document.createElement('div');
        statusEl.classList.add('event-status-indicator', 'status-' + ev.status);
        if (ev.status === 'waiting') {
          statusEl.textContent = '⏳ Waiting for Hardware';
        } else if (ev.status === 'received') {
          const dateText = ev.statusDate ? ' (' + ev.statusDate + ')' : '';
          statusEl.textContent = '✓ Hardware Received' + dateText;
        }
        card.appendChild(statusEl);
      }

      // Backup Stock badge
      if (ev.isBackupStock) {
        const badge = document.createElement('div');
        badge.classList.add('backup-stock-badge');
        badge.textContent = 'Backup Stock';
        card.appendChild(badge);
      }

      // Click handler — open modal for editing (stop propagation so cell click doesn't fire)
      card.addEventListener('click', function (e) {
        e.stopPropagation();
        openEventModal(date, ev);
      });

      container.appendChild(card);
    });
  }

  // ==================== WEEK VIEW ====================

  /**
   * Render a single week (Mon–Sun) with the same cell structure as month view.
   */
  function renderWeekView() {
    var today = todayStr();

    for (var i = 0; i < 7; i++) {
      var d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      var dateStr = dateToStr(d);

      var cell = document.createElement('div');
      cell.classList.add('day-cell');

      // Weekend
      if (i === 5 || i === 6) cell.classList.add('weekend');
      // Today
      if (dateStr === today) cell.classList.add('today');

      // Day number
      var dayNumEl = document.createElement('div');
      dayNumEl.classList.add('day-number');
      dayNumEl.textContent = d.getDate();
      cell.appendChild(dayNumEl);

      // Events container
      var eventContainer = document.createElement('div');
      eventContainer.classList.add('event-container');
      cell.appendChild(eventContainer);
      renderEventsInCell(eventContainer, dateStr);

      // Add hint
      var hint = document.createElement('div');
      hint.classList.add('add-event-hint');
      hint.textContent = '+';
      cell.appendChild(hint);

      // Click to add event
      (function (ds) {
        cell.addEventListener('click', function () {
          openEventModal(ds);
        });
      })(dateStr);

      // Drag-drop target handlers (same as month view)
      cell.dataset.date = dateStr;
      addDropHandlers(cell, false);

      $calendarGrid.appendChild(cell);
    }
  }

  // ==================== DAY VIEW ====================

  /**
   * Render a single day with full event details and an add button.
   */
  function renderDayView() {
    var dateStr = dateToStr(currentDay);
    var container = document.createElement('div');
    container.classList.add('day-view-container');

    // Header
    var header = document.createElement('div');
    header.classList.add('day-view-header');
    header.textContent = formatDateNice(dateStr);
    container.appendChild(header);

    // Events for this day
    var dayEvents = events.filter(function (ev) { return ev.date === dateStr; });

    if (dayEvents.length === 0) {
      var emptyMsg = document.createElement('div');
      emptyMsg.classList.add('day-view-empty');
      emptyMsg.textContent = 'No events scheduled';
      container.appendChild(emptyMsg);
    } else {
      dayEvents.forEach(function (ev) {
        var row = document.createElement('div');
        row.classList.add('day-view-event', 'event-card');
        row.dataset.eventId = ev.id;
        row.dataset.eventDate = dateStr;

        var catColor = ev.categoryColor || 'var(--accent-blue)';
        row.style.borderLeftColor = catColor;

        var content = document.createElement('div');
        content.classList.add('day-view-event-content');

        // Title
        var titleEl = document.createElement('div');
        titleEl.classList.add('event-title');
        titleEl.textContent = ev.title;
        content.appendChild(titleEl);

        // Category name
        if (ev.categoryName) {
          var catEl = document.createElement('div');
          catEl.style.fontFamily = 'var(--font-handwritten)';
          catEl.style.fontSize = '0.95rem';
          catEl.style.color = catColor;
          catEl.style.fontWeight = '600';
          catEl.style.marginTop = '2px';
          catEl.textContent = ev.categoryName;
          content.appendChild(catEl);
        }

        // Items
        if (ev.items && ev.items.length > 0) {
          var itemsEl = document.createElement('div');
          itemsEl.classList.add('event-items');
          itemsEl.textContent = ev.items.map(function (it) {
            return it.quantity + '× ' + it.itemName;
          }).join(', ');
          content.appendChild(itemsEl);
        }

        // Details
        if (ev.details && ev.details.trim()) {
          var detailsEl = document.createElement('div');
          detailsEl.classList.add('event-details');
          detailsEl.textContent = ev.details;
          content.appendChild(detailsEl);
        }

        // Status
        if (ev.status && ev.status !== 'pending') {
          var statusEl = document.createElement('div');
          statusEl.classList.add('event-status-indicator', 'status-' + ev.status);
          if (ev.status === 'waiting') {
            statusEl.textContent = '\u23f3 Waiting for Hardware';
          } else if (ev.status === 'received') {
            var dateText = ev.statusDate ? ' (' + ev.statusDate + ')' : '';
            statusEl.textContent = '\u2713 Hardware Received' + dateText;
          }
          content.appendChild(statusEl);
        }

        // Backup Stock badge
        if (ev.isBackupStock) {
          var badge = document.createElement('div');
          badge.classList.add('backup-stock-badge');
          badge.textContent = 'Backup Stock';
          content.appendChild(badge);
        }

        row.appendChild(content);

        // Click to edit
        row.addEventListener('click', function (e) {
          e.stopPropagation();
          openEventModal(dateStr, ev);
        });

        container.appendChild(row);
      });
    }

    // Add event button
    var addBtn = document.createElement('button');
    addBtn.classList.add('day-view-add-btn');
    addBtn.textContent = '+ Add Event';
    addBtn.addEventListener('click', function () {
      openEventModal(dateStr);
    });
    container.appendChild(addBtn);

    $calendarGrid.appendChild(container);
  }

  // ==================== DRAG-AND-DROP ====================

  /**
   * Attach drag-drop target listeners to a day cell.
   * @param {HTMLElement} cell - the day cell element (must have dataset.date set)
   * @param {boolean} isOtherMonth - if true, drops are disabled
   */
  function addDropHandlers(cell, isOtherMonth) {
    cell.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    cell.addEventListener('dragenter', function (e) {
      e.preventDefault();
      if (draggedEventId && !isOtherMonth) {
        cell.classList.add('drag-over');
      }
    });

    cell.addEventListener('dragleave', function (e) {
      if (!cell.contains(e.relatedTarget)) {
        cell.classList.remove('drag-over');
      }
    });

    cell.addEventListener('drop', function (e) {
      e.preventDefault();
      cell.classList.remove('drag-over');
      var eventId = e.dataTransfer.getData('text/plain');
      if (!eventId || isOtherMonth) return;
      moveEventToDate(eventId, cell.dataset.date);
    });
  }

  /**
   * Move an event to a new date by updating it via the API.
   * @param {string} eventId - UUID of the event
   * @param {string} newDate - target date as YYYY-MM-DD
   */
  async function moveEventToDate(eventId, newDate) {
    // Find the event to check if it's already on this date
    const ev = events.find(function (e) { return e.id === eventId; });
    if (!ev || ev.date === newDate) return;

    // Confirm before moving to prevent accidental drags
    const confirmed = confirm(
      'Move "' + ev.title + '" to ' + formatDateNice(newDate) + '?'
    );
    if (!confirmed) return;

    try {
      await API.updateEvent(eventId, { date: newDate });
      await loadAndRender();
    } catch (err) {
      console.error('Error moving event:', err);
    }
  }

  // ==================== NAVIGATION ====================

  function goToPrev() {
    if (currentView === 'month') {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
    } else if (currentView === 'week') {
      currentWeekStart.setDate(currentWeekStart.getDate() - 7);
      // Sync month/year to week start
      currentMonth = currentWeekStart.getMonth();
      currentYear = currentWeekStart.getFullYear();
    } else {
      currentDay.setDate(currentDay.getDate() - 1);
      currentMonth = currentDay.getMonth();
      currentYear = currentDay.getFullYear();
    }
    loadAndRender();
  }

  function goToNext() {
    if (currentView === 'month') {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
    } else if (currentView === 'week') {
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      currentMonth = currentWeekStart.getMonth();
      currentYear = currentWeekStart.getFullYear();
    } else {
      currentDay.setDate(currentDay.getDate() + 1);
      currentMonth = currentDay.getMonth();
      currentYear = currentDay.getFullYear();
    }
    loadAndRender();
  }

  function goToToday() {
    const now = new Date();
    currentMonth = now.getMonth();
    currentYear = now.getFullYear();
    currentWeekStart = getMonday(now);
    currentDay = new Date(now);
    currentDay.setHours(0, 0, 0, 0);
    loadAndRender();
  }

  function updateDisplayLabel() {
    if (currentView === 'month') {
      $monthYearDisplay.textContent = MONTH_NAMES[currentMonth] + ' ' + currentYear;
    } else if (currentView === 'week') {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      var startStr = MONTH_NAMES[currentWeekStart.getMonth()] + ' ' + currentWeekStart.getDate();
      var endStr = MONTH_NAMES[weekEnd.getMonth()] + ' ' + weekEnd.getDate() + ', ' + weekEnd.getFullYear();
      $monthYearDisplay.textContent = startStr + ' – ' + endStr;
    } else {
      $monthYearDisplay.textContent = formatDateNice(dateToStr(currentDay));
    }
  }

  /**
   * Switch the active view and re-render.
   */
  function switchView(view) {
    if (view === currentView) return;
    currentView = view;

    // Update toggle button active states
    document.querySelectorAll('.view-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Initialize week/day anchors if needed
    var refDate = new Date(currentYear, currentMonth, currentDay ? currentDay.getDate() : new Date().getDate());
    if (view === 'week' && !currentWeekStart) {
      currentWeekStart = getMonday(refDate);
    }
    if (view === 'day' && !currentDay) {
      currentDay = new Date();
      currentDay.setHours(0, 0, 0, 0);
    }

    // Show/hide day headers (not needed in day view)
    var $dayHeaders = document.getElementById('day-headers');
    $dayHeaders.style.display = (view === 'day') ? 'none' : '';

    loadAndRender();
  }

  // ==================== EVENT MODAL ====================

  /**
   * Open the event modal for creating or editing an event.
   * @param {string} date - YYYY-MM-DD
   * @param {Object|null} event - existing event to edit, or null for new
   */
  function openEventModal(date, event) {
    selectedDate = date;
    editingEvent = event || null;

    // Set modal title
    $eventModalTitle.textContent = editingEvent ? 'Edit Event' : 'Add Event';

    // Set date display
    $eventModalDate.textContent = formatDateNice(date);

    // Populate category dropdown (always refresh)
    populateCategoryDropdown();
    populateItemPickerDropdown();

    if (editingEvent) {
      // Populate fields from event
      $eventTitle.value = editingEvent.title || '';
      $eventDetails.value = editingEvent.details || '';
      $eventCategory.value = editingEvent.categoryId || '';
      $eventStatus.value = editingEvent.status || 'pending';
      $eventStatusDate.value = editingEvent.statusDate || '';
      $eventBackupStock.checked = !!editingEvent.isBackupStock;
      // Load existing items
      modalItems = (editingEvent.items || []).map(function (it) {
        return { itemId: it.itemId, itemName: it.itemName, quantity: it.quantity };
      });
      $deleteEventBtn.style.display = 'inline-flex';
    } else {
      // Clear fields for new event
      $eventTitle.value = '';
      $eventDetails.value = '';
      // Default to first category if available
      $eventCategory.value = categories.length > 0 ? categories[0].id : '';
      $eventStatus.value = 'pending';
      $eventStatusDate.value = '';
      $eventBackupStock.checked = false;
      modalItems = [];
      $deleteEventBtn.style.display = 'none';
    }

    renderAssignedItems();

    // Show/hide status date based on status
    toggleStatusDateVisibility();

    // Show modal
    $eventModal.classList.add('active');

    // Focus the title input after a brief delay (allows animation)
    setTimeout(function () {
      $eventTitle.focus();
    }, 100);
  }

  /**
   * Show the "Date Received" field only when status is "received".
   */
  function toggleStatusDateVisibility() {
    if ($eventStatus.value === 'received') {
      $statusDateGroup.style.display = '';
    } else {
      $statusDateGroup.style.display = 'none';
    }
  }

  function closeEventModal() {
    $eventModal.classList.remove('active');
    selectedDate = null;
    editingEvent = null;
  }

  async function saveEvent() {
    const title = $eventTitle.value.trim();
    const details = $eventDetails.value.trim();
    const categoryId = $eventCategory.value;
    const status = $eventStatus.value;
    const statusDate = status === 'received' ? ($eventStatusDate.value || null) : null;
    const isBackupStock = $eventBackupStock.checked;

    // Validate
    if (!title) {
      $eventTitle.style.borderColor = 'var(--accent-red)';
      $eventTitle.focus();
      setTimeout(function () {
        $eventTitle.style.borderColor = '';
      }, 2000);
      return;
    }

    const data = {
      date: selectedDate,
      title: title,
      details: details,
      categoryId: categoryId || null,
      status: status,
      statusDate: statusDate,
      isBackupStock: isBackupStock,
      items: modalItems.map(function (it) {
        return { itemId: it.itemId, quantity: it.quantity };
      }),
    };

    try {
      if (editingEvent) {
        await API.updateEvent(editingEvent.id, data);
      } else {
        await API.createEvent(data);
      }

      closeEventModal();
      await loadAndRender();
    } catch (err) {
      console.error('Error saving event:', err);
    }
  }

  async function handleDeleteEvent() {
    if (!editingEvent) return;

    const confirmed = confirm('Are you sure you want to delete this event?');
    if (!confirmed) return;

    try {
      await API.deleteEvent(editingEvent.id);
      closeEventModal();
      await loadAndRender();
    } catch (err) {
      console.error('Error deleting event:', err);
    }
  }

  // ==================== CATEGORY MANAGEMENT ====================

  function openCategoryModal() {
    renderCategoryList();
    $categoryModal.classList.add('active');
    $newCategoryName.value = '';
    $newCategoryColor.value = '#4A90D9';
  }

  function closeCategoryModal() {
    $categoryModal.classList.remove('active');
  }

  /**
   * Render the list of existing categories inside the category modal.
   */
  function renderCategoryList() {
    $categoryList.innerHTML = '';

    if (categories.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.classList.add('category-empty');
      emptyMsg.textContent = 'No categories yet. Add one below!';
      $categoryList.appendChild(emptyMsg);
      return;
    }

    categories.forEach(function (cat) {
      const item = document.createElement('div');
      item.classList.add('category-item');

      // Color swatch
      const swatch = document.createElement('div');
      swatch.classList.add('category-swatch');
      swatch.style.backgroundColor = cat.color;
      item.appendChild(swatch);

      // Name
      const nameEl = document.createElement('span');
      nameEl.classList.add('category-name');
      nameEl.textContent = cat.name;
      item.appendChild(nameEl);

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.classList.add('category-delete-btn');
      deleteBtn.setAttribute('aria-label', 'Delete category');
      deleteBtn.innerHTML = '&#10005;'; // × symbol
      deleteBtn.addEventListener('click', function () {
        handleDeleteCategory(cat.id);
      });
      item.appendChild(deleteBtn);

      $categoryList.appendChild(item);
    });
  }

  async function addCategory() {
    const name = $newCategoryName.value.trim();
    const color = $newCategoryColor.value;

    if (!name) {
      $newCategoryName.style.borderColor = 'var(--accent-red)';
      $newCategoryName.focus();
      setTimeout(function () {
        $newCategoryName.style.borderColor = '';
      }, 2000);
      return;
    }

    try {
      await API.createCategory({ name: name, color: color });
      categories = await API.getCategories();
      renderCategoryList();
      renderLegend();
      populateFilterCategoryDropdown();
      $newCategoryName.value = '';
      $newCategoryColor.value = '#4A90D9';
    } catch (err) {
      console.error('Error creating category:', err);
    }
  }

  async function handleDeleteCategory(id) {
    const confirmed = confirm('Delete this category? Events using it will lose their category.');
    if (!confirmed) return;

    try {
      await API.deleteCategory(id);
      categories = await API.getCategories();
      renderCategoryList();
      renderLegend();
      populateFilterCategoryDropdown();
      // Re-render calendar since events may have lost their category color
      await loadAndRender();
    } catch (err) {
      console.error('Error deleting category:', err);
    }
  }

  /**
   * Render the category legend in the header area.
   */
  function renderLegend() {
    $categoryLegend.innerHTML = '';

    categories.forEach(function (cat) {
      const item = document.createElement('div');
      item.classList.add('legend-item');

      const dot = document.createElement('span');
      dot.classList.add('legend-dot');
      dot.style.backgroundColor = cat.color;
      item.appendChild(dot);

      const name = document.createElement('span');
      name.textContent = cat.name;
      item.appendChild(name);

      $categoryLegend.appendChild(item);
    });
  }

  /**
   * Populate the category dropdown in the event modal with current categories.
   */
  function populateCategoryDropdown() {
    $eventCategory.innerHTML = '';

    if (categories.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No categories available';
      opt.disabled = true;
      $eventCategory.appendChild(opt);
      return;
    }

    categories.forEach(function (cat) {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      $eventCategory.appendChild(opt);
    });
  }

  // ==================== ITEM PICKER ====================

  /**
   * Populate the item picker dropdown with preset items.
   */
  function populateItemPickerDropdown() {
    $itemPickerSelect.innerHTML = '<option value="">Select item...</option>';
    presetItems.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name;
      $itemPickerSelect.appendChild(opt);
    });
  }

  /**
   * Add the selected item to the modal's assigned items list.
   */
  function addItemToModal() {
    var itemId = $itemPickerSelect.value;
    var qty = parseInt($itemPickerQty.value, 10);
    if (!itemId || !qty || qty < 1) return;

    // Check if already assigned — if so, update quantity
    var existing = modalItems.find(function (it) { return it.itemId === itemId; });
    if (existing) {
      existing.quantity += qty;
    } else {
      var item = presetItems.find(function (it) { return it.id === itemId; });
      if (!item) return;
      modalItems.push({ itemId: item.id, itemName: item.name, quantity: qty });
    }

    $itemPickerSelect.value = '';
    $itemPickerQty.value = '1';
    renderAssignedItems();
  }

  /**
   * Remove an item from the modal's assigned items list.
   */
  function removeItemFromModal(itemId) {
    modalItems = modalItems.filter(function (it) { return it.itemId !== itemId; });
    renderAssignedItems();
  }

  /**
   * Render the assigned items list in the event modal.
   */
  function renderAssignedItems() {
    $assignedItemsList.innerHTML = '';
    if (modalItems.length === 0) return;

    modalItems.forEach(function (it) {
      var row = document.createElement('div');
      row.classList.add('assigned-item-row');

      var qtyEl = document.createElement('span');
      qtyEl.classList.add('assigned-item-qty');
      qtyEl.textContent = it.quantity + '\u00d7';

      var nameEl = document.createElement('span');
      nameEl.classList.add('assigned-item-name');
      nameEl.textContent = it.itemName;

      var removeBtn = document.createElement('button');
      removeBtn.classList.add('assigned-item-remove');
      removeBtn.textContent = '\u00d7';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', function () {
        removeItemFromModal(it.itemId);
      });

      row.appendChild(qtyEl);
      row.appendChild(nameEl);
      row.appendChild(removeBtn);
      $assignedItemsList.appendChild(row);
    });
  }

  // ==================== ITEMS MODAL ====================

  function openItemsModal() {
    renderItemsList();
    $itemsModal.classList.add('active');
  }

  function closeItemsModal() {
    $itemsModal.classList.remove('active');
  }

  function renderItemsList() {
    $itemsList.innerHTML = '';

    if (presetItems.length === 0) {
      $itemsList.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-style:italic;">No items yet. Add one below.</div>';
      return;
    }

    presetItems.forEach(function (item) {
      var row = document.createElement('div');
      row.classList.add('category-item');

      var nameEl = document.createElement('span');
      nameEl.classList.add('category-item-name');
      nameEl.textContent = item.name;

      var deleteBtn = document.createElement('button');
      deleteBtn.classList.add('btn', 'btn-ghost', 'btn-sm');
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', function () {
        handleDeleteItem(item.id);
      });

      row.appendChild(nameEl);
      row.appendChild(deleteBtn);
      $itemsList.appendChild(row);
    });
  }

  async function addItem() {
    var name = $newItemName.value.trim();
    if (!name) return;

    try {
      await API.createItem({ name: name });
      presetItems = await API.getItems();
      renderItemsList();
      populateItemPickerDropdown();
      $newItemName.value = '';
    } catch (err) {
      console.error('Error creating item:', err);
    }
  }

  async function handleDeleteItem(id) {
    var confirmed = confirm('Delete this item? It will be removed from all events.');
    if (!confirmed) return;

    try {
      await API.deleteItem(id);
      presetItems = await API.getItems();
      renderItemsList();
      populateItemPickerDropdown();
      await loadAndRender();
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  }

  // ==================== FILTERS ====================

  /**
   * Populate the category filter dropdown with current categories.
   */
  function populateFilterCategoryDropdown() {
    // Preserve current selection
    var current = $filterCategory.value;
    // Remove all options after the first ("All Categories")
    while ($filterCategory.options.length > 1) {
      $filterCategory.remove(1);
    }
    categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      $filterCategory.appendChild(opt);
    });
    // Restore selection if it still exists
    $filterCategory.value = current;
    if ($filterCategory.selectedIndex === -1) {
      $filterCategory.value = 'all';
    }
  }

  /**
   * Apply current filters — show/hide event cards and update the match count.
   * Called after every render and whenever a filter changes.
   */
  function applyFilters() {
    var catFilter = $filterCategory.value;
    var statusFilter = $filterStatus.value;
    var dateFrom = $filterDateFrom.value;
    var dateTo = $filterDateTo.value;
    var backupOnly = $filterBackupStock.checked;

    var allCards = document.querySelectorAll('.event-card');
    var totalCount = allCards.length;
    var visibleCount = 0;

    allCards.forEach(function (card) {
      var eventId = card.dataset.eventId;
      var ev = events.find(function (e) { return e.id === eventId; });
      if (!ev) { card.classList.add('filtered-out'); return; }

      var show = true;

      // Category filter
      if (catFilter !== 'all' && ev.categoryId !== catFilter) {
        show = false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        var evStatus = ev.status || 'pending';
        if (evStatus !== statusFilter) {
          show = false;
        }
      }

      // Date range filter
      if (dateFrom && ev.date < dateFrom) {
        show = false;
      }
      if (dateTo && ev.date > dateTo) {
        show = false;
      }

      // Backup stock filter
      if (backupOnly && !ev.isBackupStock) {
        show = false;
      }

      if (show) {
        card.classList.remove('filtered-out');
        visibleCount++;
      } else {
        card.classList.add('filtered-out');
      }
    });

    // Update count label
    var hasActiveFilter = (catFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo || backupOnly);
    if (hasActiveFilter) {
      $filterCount.textContent = visibleCount + ' of ' + totalCount + ' events';
    } else {
      $filterCount.textContent = '';
    }
  }

  /**
   * Clear all filters and re-show everything.
   */
  function clearFilters() {
    $filterCategory.value = 'all';
    $filterStatus.value = 'all';
    $filterDateFrom.value = '';
    $filterDateTo.value = '';
    $filterBackupStock.checked = false;
    applyFilters();
  }

  // ==================== DATA LOADING ====================

  /**
   * Load events for the current month and re-render the calendar.
   */
  async function loadAndRender() {
    updateDisplayLabel();

    try {
      // API expects 1-12 for month
      events = await API.getEvents(currentMonth + 1, currentYear);

      // For week view, we may need events from adjacent months
      if (currentView === 'week') {
        var weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd.getMonth() !== currentWeekStart.getMonth()) {
          var extra = await API.getEvents(weekEnd.getMonth() + 1, weekEnd.getFullYear());
          // Merge without duplicates
          var existingIds = new Set(events.map(function (e) { return e.id; }));
          extra.forEach(function (e) { if (!existingIds.has(e.id)) events.push(e); });
        }
      }
    } catch (err) {
      console.error('Error loading events:', err);
      events = [];
    }

    // Clear grid and apply correct view class
    $calendarGrid.innerHTML = '';
    $calendarGrid.classList.remove('view-week', 'view-day');

    if (currentView === 'week') {
      $calendarGrid.classList.add('view-week');
      renderWeekView();
    } else if (currentView === 'day') {
      $calendarGrid.classList.add('view-day');
      renderDayView();
    } else {
      renderCalendar();
    }

    applyFilters();
  }

  // ==================== INITIALIZATION ====================

  async function init() {
    // Cache DOM references
    $monthYearDisplay = document.getElementById('month-year-display');
    $prevMonthBtn = document.getElementById('prev-month-btn');
    $nextMonthBtn = document.getElementById('next-month-btn');
    $todayBtn = document.getElementById('today-btn');
    $calendarGrid = document.getElementById('calendar-grid');
    $categoryLegend = document.getElementById('category-legend');
    $manageCategoriesBtn = document.getElementById('manage-categories-btn');

    // Event modal
    $eventModal = document.getElementById('event-modal');
    $eventModalTitle = document.getElementById('event-modal-title');
    $eventModalDate = document.getElementById('event-modal-date');
    $eventTitle = document.getElementById('event-title');
    $eventDetails = document.getElementById('event-details');
    $eventCategory = document.getElementById('event-category');
    $eventStatus = document.getElementById('event-status');
    $eventStatusDate = document.getElementById('event-status-date');
    $statusDateGroup = document.getElementById('status-date-group');
    $eventBackupStock = document.getElementById('event-backup-stock');
    $saveEventBtn = document.getElementById('save-event-btn');
    $deleteEventBtn = document.getElementById('delete-event-btn');
    $cancelEventBtn = document.getElementById('cancel-event-btn');

    // Category modal
    $categoryModal = document.getElementById('category-modal');
    $categoryList = document.getElementById('category-list');
    $newCategoryName = document.getElementById('new-category-name');
    $newCategoryColor = document.getElementById('new-category-color');
    $addCategoryBtn = document.getElementById('add-category-btn');
    $closeCategoryModalBtn = document.getElementById('close-category-modal-btn');

    // Filters
    $filterCategory = document.getElementById('filter-category');
    $filterStatus = document.getElementById('filter-status');
    $filterDateFrom = document.getElementById('filter-date-from');
    $filterDateTo = document.getElementById('filter-date-to');
    $clearFiltersBtn = document.getElementById('clear-filters-btn');
    $filterCount = document.getElementById('filter-count');
    $filterBackupStock = document.getElementById('filter-backup-stock');

    // Item picker (in event modal)
    $itemPickerSelect = document.getElementById('item-picker-select');
    $itemPickerQty = document.getElementById('item-picker-qty');
    $itemPickerAddBtn = document.getElementById('item-picker-add-btn');
    $assignedItemsList = document.getElementById('assigned-items-list');

    // Items modal
    $itemsModal = document.getElementById('items-modal');
    $itemsList = document.getElementById('items-list');
    $newItemName = document.getElementById('new-item-name');
    $addItemBtn = document.getElementById('add-item-btn');
    $closeItemsModalBtn = document.getElementById('close-items-modal-btn');
    $manageItemsBtn = document.getElementById('manage-items-btn');

    // Load categories
    try {
      categories = await API.getCategories();
    } catch (err) {
      console.error('Error loading categories:', err);
      categories = [];
    }
    renderLegend();
    populateFilterCategoryDropdown();

    // Load preset items
    try {
      presetItems = await API.getItems();
    } catch (err) {
      console.error('Error loading items:', err);
      presetItems = [];
    }

    // ==================== EVENT LISTENERS ====================

    // Navigation
    $prevMonthBtn.addEventListener('click', goToPrev);
    $nextMonthBtn.addEventListener('click', goToNext);
    $todayBtn.addEventListener('click', goToToday);

    // View toggle
    document.querySelectorAll('.view-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchView(btn.dataset.view);
      });
    });

    // Event modal buttons
    $saveEventBtn.addEventListener('click', saveEvent);
    $deleteEventBtn.addEventListener('click', handleDeleteEvent);
    $cancelEventBtn.addEventListener('click', closeEventModal);

    // Status dropdown — show/hide date received field
    $eventStatus.addEventListener('change', toggleStatusDateVisibility);

    // Category modal buttons
    $manageCategoriesBtn.addEventListener('click', openCategoryModal);
    $closeCategoryModalBtn.addEventListener('click', closeCategoryModal);
    $addCategoryBtn.addEventListener('click', addCategory);

    // Item picker
    $itemPickerAddBtn.addEventListener('click', addItemToModal);

    // Items modal buttons
    $manageItemsBtn.addEventListener('click', openItemsModal);
    $closeItemsModalBtn.addEventListener('click', closeItemsModal);
    $addItemBtn.addEventListener('click', addItem);

    // Filter controls
    $filterCategory.addEventListener('change', applyFilters);
    $filterStatus.addEventListener('change', applyFilters);
    $filterDateFrom.addEventListener('change', applyFilters);
    $filterDateTo.addEventListener('change', applyFilters);
    $clearFiltersBtn.addEventListener('click', clearFilters);
    $filterBackupStock.addEventListener('change', applyFilters);

    // Enter key in new category name input → add category
    $newCategoryName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCategory();
      }
    });

    // Enter key in new item name input → add item
    $newItemName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addItem();
      }
    });

    // Enter key in event title → save event
    $eventTitle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEvent();
      }
    });

    // Click on overlay backdrop to close modals
    $eventModal.addEventListener('click', function (e) {
      if (e.target === $eventModal) {
        closeEventModal();
      }
    });

    $categoryModal.addEventListener('click', function (e) {
      if (e.target === $categoryModal) {
        closeCategoryModal();
      }
    });

    $itemsModal.addEventListener('click', function (e) {
      if (e.target === $itemsModal) {
        closeItemsModal();
      }
    });

    // Escape key to close modals
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if ($eventModal.classList.contains('active')) {
          closeEventModal();
        } else if ($categoryModal.classList.contains('active')) {
          closeCategoryModal();
        } else if ($itemsModal.classList.contains('active')) {
          closeItemsModal();
        }
      }
    });

    // Keyboard navigation for months
    document.addEventListener('keydown', function (e) {
      // Only navigate if no modal is open and no input is focused
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
      const modalOpen = $eventModal.classList.contains('active') || $categoryModal.classList.contains('active');

      if (!isInput && !modalOpen) {
        if (e.key === 'ArrowLeft') {
          goToPrev();
        } else if (e.key === 'ArrowRight') {
          goToNext();
        }
      }
    });

    // Initial load
    await loadAndRender();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
