// jQuery Gantt Chart
// ==================

// Basic usage:

//      $(".selector").gantt({
//          source: "ajax/data.json",
//          scale: "weeks",
//          minScale: "weeks",
//          maxScale: "months",
//          onItemClick: function(data) {
//              alert("Item clicked - show some details");
//          },
//          onAddClick: function(dt, rowId) {
//              alert("Empty space clicked - add an item!");
//          },
//          onRender: function() {
//              console.log("chart rendered");
//          }
//      });

//
/*jshint shadow:true, unused:false, laxbreak:true, evil:true*/
/*globals jQuery, alert*/
(function ($) {

    "use strict";
    
    $.fn.gantt = function (options) {

        var cookieKey = "jquery.fn.gantt";
        var scales = ["hours", "days", "weeks", "months"];
        
        
        
        var settings = $.extend({}, $.fn.gantt.defaults, options);

        // custom selector `:findday` used to match on specified day in ms.
        //
        // The selector is passed a date in ms and elements are added to the
        // selection filter if the element date matches, as determined by the
        // id attribute containing a parsable date in ms.
        $.extend($.expr[":"], {
            findday: function (a, i, m) {
                var cd = new Date(parseInt(m[3], 10));
                var id = $(a).attr("id");
                id = id ? id : "";
                var si = id.indexOf("-") + 1;
                var ed = new Date(parseInt(id.substring(si, id.length), 10));
                cd = new Date(cd.getFullYear(), cd.getMonth(), cd.getDate());
                ed = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate());
                return cd.getTime() === ed.getTime();
            }
        });
        // custom selector `:findweek` used to match on specified week in ms.
        $.extend($.expr[":"], {
            findweek: function (a, i, m) {
                var cd = new Date(parseInt(m[3], 10));
                var id = $(a).attr("id");
                id = id ? id : "";
                var si = id.indexOf("-") + 1;
                cd = cd.getFullYear() + "-" + cd.getDayForWeek().getWeekOfYear();
                var ed = id.substring(si, id.length);
                return cd === ed;
            }
        });
        // custom selector `:findmonth` used to match on specified month in ms.
        $.extend($.expr[":"], {
            findmonth: function (a, i, m) {
                var cd = new Date(parseInt(m[3], 10));
                cd = cd.getFullYear() + "-" + cd.getMonth();
                var id = $(a).attr("id");
                id = id ? id : "";
                var si = id.indexOf("-") + 1;
                var ed = id.substring(si, id.length);
                return cd === ed;
            }
        });

        // Date prototype helpers
        // ======================

        // `getWeekId` returns a string in the form of 'dh-YYYY-WW', where WW is
        // the week # for the year.
        // It is used to add an id to the week divs
        Date.prototype.getWeekId = function () {
            var y = this.getFullYear();
            var w = this.getDayForWeek().getWeekOfYear();
            var m = this.getMonth();
            if (m === 11 && w === 1) {
                y++;
            }
            return 'dh-' + y + "-" + w;
        };

        // `getRepDate` returns the seconds since the epoch for a given date
        // depending on the active scale
        Date.prototype.genRepDate = function () {
            switch (settings.scale) {
                case "hours":
                    return this.getTime();
                case "weeks":
                    return this.getDayForWeek().getTime();
                case "months":
                    return new Date(this.getFullYear(), this.getMonth(), 1).getTime();
                default:
                    return this.getTime();
            }
        };

        // `getDayOfYear` returns the day number for the year
        Date.prototype.getDayOfYear = function () {
            var fd = new Date(this.getFullYear(), 0, 0);
            var sd = new Date(this.getFullYear(), this.getMonth(), this.getDate());
            return Math.ceil((sd - fd) / 86400000);
        };

        // `getWeekOfYear` returns the week number for the year
        Date.prototype.getWeekOfYear = function () {
            var ys = new Date(this.getFullYear(), 0, 1);
            var sd = new Date(this.getFullYear(), this.getMonth(), this.getDate());
            if (ys.getDay() > 3) {
                ys = new Date(sd.getFullYear(), 0, (7 - ys.getDay()));
            }
            var daysCount = sd.getDayOfYear() - ys.getDayOfYear();
            return Math.ceil(daysCount / 7);

        };

        // `getDaysInMonth` returns the number of days in a month
        Date.prototype.getDaysInMonth = function () {
            return 32 - new Date(this.getFullYear(), this.getMonth(), 32).getDate();
        };

        // `hasWeek` returns `true` if the date resides on a week boundary
        // **????????????????? Don't know if this is true**
        Date.prototype.hasWeek = function () {
            var df = new Date(this.valueOf());
            df.setDate(df.getDate() - df.getDay());
            var dt = new Date(this.valueOf());
            dt.setDate(dt.getDate() + (6 - dt.getDay()));

            if (df.getMonth() === dt.getMonth()) {
                return true;
            } else {
                return (df.getMonth() === this.getMonth() && dt.getDate() < 4) || (df.getMonth() !== this.getMonth() && dt.getDate() >= 4);
            }
        };

        // `getDayForWeek` returns the Date object for the starting date of
        // the week # for the year
        Date.prototype.getDayForWeek = function () {
            var df = new Date(this.valueOf());
            df.setDate(df.getDate() - df.getDay());
            var dt = new Date(this.valueOf());
            dt.setDate(dt.getDate() + (6 - dt.getDay()));
            if ((df.getMonth() === dt.getMonth()) || (df.getMonth() !== dt.getMonth() && dt.getDate() >= 4)) {
                return new Date(dt.setDate(dt.getDate() - 3));
            } else {
                return new Date(df.setDate(df.getDate() + 3));
            }
        };


        // Grid management
        // ===============

        // Core object is responsible for navigation and rendering
        var Gantt = function (element) {
            // **Create the chart**
            var gantt = this;
            gantt.element = element;
            gantt.$element = $(gantt.element);
            
            
            gantt.data = null;        // Received data
            gantt.pageNum = 0;        // Current page number
            gantt.pageCount = 0;      // Available pages count
            gantt.rowsOnLastPage = 0; // How many rows on last page
            gantt.rowsNum = 0;        // Number of total rows
            gantt.hPosition = 0;      // Current position on diagram (Horizontal)
            gantt.dateStart = null;
            gantt.dateEnd = null;
            gantt.scrollClicked = false;
            gantt.scaleOldWidth = null;
            gantt.headerRows = null;

            // Update cookie with current scale
            if (settings.useCookie) {
                var sc = $.cookie(gantt.cookieKey + "CurrentScale");
                if (sc) {
                    settings.scale = $.cookie(gantt.cookieKey + "CurrentScale");
                } else {
                    $.cookie(gantt.cookieKey + "CurrentScale", settings.scale);
                }
            }

            switch (settings.scale) {
                //case "hours": this.headerRows = 5; this.scaleStep = 8; break;
                case "hours": gantt.headerRows = 5; gantt.scaleStep = 1; break;
                case "weeks": gantt.headerRows = 3; gantt.scaleStep = 13; break;
                case "months": gantt.headerRows = 2; gantt.scaleStep = 14; break;
                default: gantt.headerRows = 4; gantt.scaleStep = 13; break;
            }

            gantt.scrollNavigation = {
                panelMouseDown: false,
                scrollerMouseDown: false,
                mouseX: null,
                panelMargin: 0,
                repositionDelay: 0,
                panelMaxPos: 0,
                canScroll: true
            };

            gantt.$gantt = null;
            gantt.loader = null;
            
            // Initialize data with a json object or fetch via an xhr
            // request depending on `settings.source`
            if (typeof settings.source !== "string") {
                gantt.data = settings.source;
                gantt.init(gantt);
            } else {
                $.getJSON(settings.source, function (jsData) {
                    gantt.data = jsData;
                    gantt.init(gantt);
                });
            }

        };
        
        // Return the element whose topmost point lies under the given point
        // Normalizes for IE
        Gantt.prototype.elementFromPoint = function (x, y) {

            if ($.browser.msie) {
                x -= $(document).scrollLeft();
                y -= $(document).scrollTop();
            } else {
                x -= window.pageXOffset;
                y -= window.pageYOffset;
            }

            return document.elementFromPoint(x, y);
        };
        
        // **Setup the initial view**
        // Here we calculate the number of rows, pages and visible start
        // and end dates once the data is ready
        Gantt.prototype.init = function (gantt) {
            gantt.rowsNum = gantt.data.length;
            gantt.pageCount = Math.ceil(gantt.rowsNum / settings.itemsPerPage);
            gantt.rowsOnLastPage = gantt.rowsNum - (Math.floor(gantt.rowsNum / settings.itemsPerPage) * settings.itemsPerPage);

            gantt.dateStart = tools.getMinDate(gantt);
            gantt.dateEnd = tools.getMaxDate(gantt);


            /* core.render(element); */
            this.waitToggle(gantt, true, function (gantt) { gantt.render(gantt); });
        };

        // **Render the grid**
        Gantt.prototype.render = function (gantt) {
            var content = $('<div class="fn-content"/>');
            var $leftPanel = this.leftPanel(gantt);
            content.append($leftPanel);
            var $rightPanel = this.rightPanel(gantt, $leftPanel);
            var mLeft, hPos;

            content.append($rightPanel);
            content.append(this.navigation(gantt));

            var $dataPanel = $rightPanel.find(".dataPanel");

            gantt.$gantt = $('<div class="fn-gantt" />').append(content);

            gantt.$element.html(gantt.$gantt);

            gantt.scrollNavigation.panelMargin = parseInt($dataPanel.css("margin-left").replace("px", ""), 10);
            gantt.scrollNavigation.panelMaxPos = ($dataPanel.width() - $rightPanel.width());

            gantt.scrollNavigation.canScroll = ($dataPanel.width() > $rightPanel.width());
            




            this.markNow(gantt);
            this.fillData(gantt, $dataPanel, $leftPanel);

            var header = $dataPanel.children('.header');
            $dataPanel.children('.content').scroll(function(e) {
                $(this).scrollLeft();
                header.css({marginLeft: $(this).scrollLeft() * -1});
                //$leftPanel.css({marginTop: $(this).scrollTop() * -1});
            });

            // Set a cookie to record current position in the view
            if (settings.useCookie) {
                var sc = $.cookie(this.cookieKey + "ScrollPos");
                if (sc) {
                    gantt.hPosition = sc;
                }
            }

            // Scroll the grid to today's date
            if (settings.scrollToToday) {
                var startPos = Math.round((settings.startPos / 1000 - gantt.dateStart / 1000) / 86400) - 2;
                if ((startPos > 0 && gantt.hPosition !== 0)) {
                    if (gantt.scaleOldWidth) {
                        mLeft = ($dataPanel.width() - $rightPanel.width());
                        hPos = mLeft * gantt.hPosition / gantt.scaleOldWidth;
                        hPos = hPos > 0 ? 0 : hPos;
                        $dataPanel.css({ "margin-left": hPos + "px" });
                        gantt.scrollNavigation.panelMargin = hPos;
                        gantt.hPosition = hPos;
                        gantt.scaleOldWidth = null;
                    } else {
                        $dataPanel.css({ "margin-left": gantt.hPosition + "px" });
                        gantt.scrollNavigation.panelMargin = gantt.hPosition;
                    }
                    this.repositionLabel(gantt);
                } else {
                    this.repositionLabel(gantt);
                }
            // or, scroll the grid to the left most date in the panel
            } else {
                if ((gantt.hPosition !== 0)) {
                    if (gantt.scaleOldWidth) {
                        mLeft = ($dataPanel.width() - $rightPanel.width());
                        hPos = mLeft * gantt.hPosition / gantt.scaleOldWidth;
                        hPos = hPos > 0 ? 0 : hPos;
                        $dataPanel.css({ "margin-left": hPos + "px" });
                        gantt.scrollNavigation.panelMargin = hPos;
                        gantt.hPosition = hPos;
                        gantt.scaleOldWidth = null;
                    } else {
                        $dataPanel.css({ "margin-left": gantt.hPosition + "px" });
                        gantt.scrollNavigation.panelMargin = gantt.hPosition;
                    }
                    this.repositionLabel(gantt);
                } else {
                    this.repositionLabel(gantt);
                }
            }
            this.waitToggle(gantt, false);
            settings.onRender();
        };

        // Create and return the left panel with labels
        Gantt.prototype.leftPanel = function (gantt) {
            /* Left panel */
            var ganttLeftPanel = $('<div class="leftPanel"/>')
                .append($('<div class="row spacer"/>')
                .css("height", tools.getCellSize() * gantt.headerRows + "px")
                .css("width", "100%"));

            var entries = [];
            $.each(gantt.data, function (i, entry) {
                if (i >= gantt.pageNum * settings.itemsPerPage && i < (gantt.pageNum * settings.itemsPerPage + settings.itemsPerPage)) {
                    entries.push('<div class="row name row' + i + (entry.desc ? '' : ' fn-wide') + '" id="rowheader' + i + '" offset="' + i % settings.itemsPerPage * tools.getCellSize() + '">');
                    entries.push('<span class="fn-label' + (entry.cssClass ? ' ' + entry.cssClass : '') + '">' + entry.name + '</span>');
                    entries.push('</div>');

                    if (entry.desc) {
                        entries.push('<div class="row desc row' + i + ' " id="RowdId_' + i + '" data-id="' + entry.id + '">');
                        entries.push('<span class="fn-label' + (entry.cssClass ? ' ' + entry.cssClass : '') + '">' + entry.desc + '</span>');
                        entries.push('</div>');
                    }

                }
            });
            ganttLeftPanel.append(entries.join(""));
            ganttLeftPanel.append('<div class="row" />');
            return ganttLeftPanel;
        };

        // Create and return the data panel element
        Gantt.prototype.dataPanel = function (gantt, width) {
            var dataPanel = $('<div class="dataPanel" style="width: ' + width + 'px;"/>');

            // Handle click events and dispatch to registered `onAddClick`
            // function
            dataPanel.click(function (e) {

                e.stopPropagation();
                var corrX, corrY;
                var leftpanel = gantt.$element.find(".fn-gantt .leftPanel");
                var datapanel = gantt.$element.find(".fn-gantt .dataPanel");
                switch (settings.scale) {
                    case "weeks":
                        corrY = tools.getCellSize() * 2;
                        break;
                    case "months":
                        corrY = tools.getCellSize();
                        break;
                    case "hours":
                        corrY = tools.getCellSize() * 4;
                        break;
                    case "days":
                        corrY = tools.getCellSize() * 3;
                        break;
                    default:
                        corrY = tools.getCellSize() * 2;
                        break;
                }

                /* Adjust, so get middle of elm
                corrY -= Math.floor(tools.getCellSize() / 2);
                */

                // Find column where click occurred
                var col = gantt.elementFromPoint(e.pageX, datapanel.offset().top + corrY);
                // Was the label clicked directly?
                if (col.className === "fn-label") {
                    col = $(col.parentNode);
                } else {
                    col = $(col);
                }

                var dt = col.attr("repdate");
                // Find row where click occurred
                var row = gantt.elementFromPoint(leftpanel.offset().left + leftpanel.width() - 10, e.pageY);
                // Was the lable clicked directly?
                if (row.className.indexOf("fn-label") === 0) {
                    row = $(row.parentNode);
                } else {
                    row = $(row);
                }
                var rowId = row.data().id;

                // Dispatch user registered function with the DateTime in ms
                // and the id if the clicked object is a row
                settings.onAddClick(dt, rowId);
            });
            return dataPanel;
        };

        // Creates and return the right panel containing the year/week/day
        // header
        Gantt.prototype.rightPanel = function (gantt, leftPanel) {

            var range = null;
            // Days of the week have a class of one of
            // `sn` (Saturday), `sa` (Sunday), or `wd` (Weekday)
            var dowClass = [" sn", " wd", " wd", " wd", " wd", " wd", " sa"];
            var gridDowClass = [" sn", "", "", "", "", "", " sa"];

            var yearArr = [];
            var daysInYear = 0;

            var monthArr = [];
            var daysInMonth = 0;

            var dayArr = [];

            var hoursInDay = 0;

            var dowArr = [];

            var horArr = [];


            var today = new Date();
            today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            var holidays = settings.holidays ? settings.holidays.join() : '';

            // Setup the headings based on the chosen `settings.scale`
            switch (settings.scale) {
                // **Hours**
                case "hours":

                    range = tools.parseTimeRange(gantt.dateStart, gantt.dateEnd, gantt.scaleStep);

                    var year = range[0].getFullYear();
                    var month = range[0].getMonth();
                    var day = range[0];

                    for (var i = 0; i < range.length; i++) {
                        var rday = range[i];

                        // Fill years
                        var rfy = rday.getFullYear();
                        if (rfy !== year) {
                            yearArr.push(
                                ('<div class="row header year" style="width: '
                                    + tools.getCellSize() * daysInYear
                                    + 'px;"><div class="fn-label">'
                                    + year
                                    + '</div></div>'));

                            year = rfy;
                            daysInYear = 0;
                        }
                        daysInYear++;


                        // Fill months
                        var rm = rday.getMonth();
                        if (rm !== month) {
                            monthArr.push(
                                ('<div class="row header month" style="width: '
                                + tools.getCellSize() * daysInMonth + 'px"><div class="fn-label">'
                                + settings.months[month]
                                + '</div></div>'));

                            month = rm;
                            daysInMonth = 0;
                        }
                        daysInMonth++;


                        // Fill days & hours

                        var rgetDay = rday.getDay();
                        var getDay = day.getDay();
                        var day_class = dowClass[rgetDay];
                        var getTime = day.getTime();
                        if (holidays.indexOf((new Date(rday.getFullYear(), rday.getMonth(), rday.getDate())).getTime()) > -1) {
                            day_class = "holiday";
                        }
                        if (rgetDay !== getDay) {

                            var day_class2 = (today - day === 0) ? ' today' : (holidays.indexOf(getTime) > -1) ? "holiday" : dowClass[getDay];

                            dayArr.push('<div class="row date ' + day_class2 + '" '
                                    + ' style="width: ' + tools.getCellSize() * hoursInDay + 'px;"> '
                                    + ' <div class="fn-label">' + day.getDate() + '</div></div>');
                            dowArr.push('<div class="row day ' + day_class2 + '" '
                                    + ' style="width: ' + tools.getCellSize() * hoursInDay + 'px;"> '
                                    + ' <div class="fn-label">' + settings.dow[getDay] + '</div></div>');

                            day = rday;
                            hoursInDay = 0;
                        }
                        hoursInDay++;

                        horArr.push('<div class="row day '
                                + day_class
                                + '" id="dh-'
                                + rday.getTime()
                                + '"  offset="' + i * tools.getCellSize() + '"  repdate="' + rday.genRepDate() + '"> '
                                + rday.getHours()
                                + '</div>');
                    }


                    // Last year
                   yearArr.push(
                        '<div class="row header year" style="width: '
                        + tools.getCellSize() * daysInYear + 'px;"><div class="fn-label">'
                        + year
                        + '</div></div>');

                    // Last month
                    monthArr.push(
                        '<div class="row header month" style="width: '
                        + tools.getCellSize() * daysInMonth + 'px"><div class="fn-label">'
                        + settings.months[month]
                        + '</div></div>');

                    var day_class = dowClass[day.getDay()];

                    if (holidays.indexOf((new Date(day.getFullYear(), day.getMonth(), day.getDate())).getTime()) > -1) {
                        day_class = "holiday";
                    }

                    dayArr.push('<div class="row date ' + day_class + '" '
                            + ' style="width: ' + tools.getCellSize() * hoursInDay + 'px;"> '
                            + ' <div class="fn-label">' + day.getDate() + '</div></div>');

                    dowArr.push('<div class="row day ' + day_class + '" '
                            + ' style="width: ' + tools.getCellSize() * hoursInDay + 'px;"> '
                            + ' <div class="fn-label">' + settings.dow[day.getDay()] + '</div></div>');

                    var dataPanel = this.dataPanel(gantt, range.length * tools.getCellSize());


                    // Append panel elements
                    var header = $('<div class="header" />').appendTo(dataPanel);
                    header.append('<div class="row">' + yearArr.join("") + '</div>');
                    header.append('<div class="row">' + monthArr.join("") + '</div>');
                    header.append('<div class="row">' + dayArr.join("") + '</div>');
                    header.append('<div class="row">' + dowArr.join("") + '</div>');
                    header.append('<div class="row">' + horArr.join("") + '</div>');

                    break;

                // **Weeks**
                case "weeks":
                    range = tools.parseWeeksRange(gantt.dateStart, gantt.dateEnd);
                    yearArr = [];
                    monthArr = [];
                    var year = range[0].getFullYear();
                    var month = range[0].getMonth();
                    var day = range[0];

                    for (var i = 0; i < range.length; i++) {
                        var rday = range[i];

                        // Fill years
                        if (rday.getFullYear() !== year) {
                            yearArr.push(
                                ('<div class="row header year" style="width: '
                                    + tools.getCellSize() * daysInYear
                                    + 'px;"><div class="fn-label">'
                                    + year
                                    + '</div></div>'));
                            year = rday.getFullYear();
                            daysInYear = 0;
                        }
                        daysInYear++;

                        // Fill months
                        if (rday.getMonth() !== month) {
                            monthArr.push(
                                ('<div class="row header month" style="width:'
                                   + tools.getCellSize() * daysInMonth
                                   + 'px;"><div class="fn-label">'
                                   + settings.months[month]
                                   + '</div></div>'));
                            month = rday.getMonth();
                            daysInMonth = 0;
                        }
                        daysInMonth++;

                        // Fill weeks
                        dayArr.push('<div class="row day wd" '
                                + ' id="' + rday.getWeekId() + '" offset="' + i * tools.getCellSize() + '" repdate="' + rday.genRepDate() + '"> '
                                + ' <div class="fn-label">' + rday.getWeekOfYear() + '</div></div>');
                    }


                    // Last year
                    yearArr.push(
                        '<div class="row header year" style="width: '
                        + tools.getCellSize() * daysInYear + 'px;"><div class="fn-label">'
                        + year
                        + '</div></div>');

                    // Last month
                    monthArr.push(
                        '<div class="row header month" style="width: '
                        + tools.getCellSize() * daysInMonth + 'px"><div class="fn-label">'
                        + settings.months[month]
                        + '</div></div>');

                    var dataPanel = this.dataPanel(gantt, range.length * tools.getCellSize());
                    var header = $('<div class="header" />').appendTo(dataPanel);
                    header.append('<div class="row">' + yearArr.join("") + '</div>');
                    header.append('<div class="row">' + monthArr.join("") + '</div>');
                    header.append('<div class="row">' + dayArr.join("") + '</div>');
                    
                    break;

                // **Months**
                case 'months':
                    range = tools.parseMonthsRange(gantt.dateStart, gantt.dateEnd);

                    var year = range[0].getFullYear();
                    var month = range[0].getMonth();
                    var day = range[0];

                    for (var i = 0; i < range.length; i++) {
                        var rday = range[i];

                        // Fill years
                        if (rday.getFullYear() !== year) {
                            yearArr.push(
                                ('<div class="row header year" style="width: '
                                    + tools.getCellSize() * daysInYear
                                    + 'px;"><div class="fn-label">'
                                    + year
                                    + '</div></div>'));
                            year = rday.getFullYear();
                            daysInYear = 0;
                        }
                        daysInYear++;
                        monthArr.push('<div class="row day wd" id="dh-' + tools.genId(rday.getTime()) + '" offset="' + i * tools.getCellSize() + '" repdate="' + rday.genRepDate() + '">' + (1 + rday.getMonth()) + '</div>');
                    }


                    // Last year
                    yearArr.push(
                        '<div class="row header year" style="width: '
                        + tools.getCellSize() * daysInYear + 'px;"><div class="fn-label">'
                        + year
                        + '</div></div>');

                    // Last month
                    monthArr.push(
                        '<div class="row header month" style="width: '
                        + tools.getCellSize() * daysInMonth + 'px">"<div class="fn-label">'
                        + settings.months[month]
                        + '</div></div>');

                    var dataPanel = this.dataPanel(gantt, range.length * tools.getCellSize());
                    var header = $('<div class="header" />').appendTo(dataPanel);
                    // Append panel elements
                    
                    header.append('<div class="row">' + yearArr.join("") + '</div>');
                    header.append('<div class="row">' + monthArr.join("") + '</div>');

                    break;

                // **Days (default)**
                default:
                    range = tools.parseDateRange(gantt.dateStart, gantt.dateEnd);

                                            var dateBefore = ktkGetNextDate(range[0], -1);
                    var year = dateBefore.getFullYear();
                    var month = dateBefore.getMonth();
                    var day = dateBefore;

                    for (var i = 0; i < range.length; i++) {
                        var rday = range[i];

                        // Fill years
                        if (rday.getFullYear() !== year) {
                            yearArr.push(
                                ('<div class="row header year" style="width:'
                                    + tools.getCellSize() * daysInYear
                                    + 'px;"><div class="fn-label">'
                                    + year
                                    + '</div></div>'));
                            year = rday.getFullYear();
                            daysInYear = 0;
                        }
                        daysInYear++;

                        // Fill months
                        if (rday.getMonth() !== month) {
                            monthArr.push(
                                ('<div class="row header month" style="width:'
                                   + tools.getCellSize() * daysInMonth
                                   + 'px;"><div class="fn-label">'
                                   + settings.months[month]
                                   + '</div></div>'));
                            month = rday.getMonth();
                            daysInMonth = 0;
                        }
                        daysInMonth++;

                        var getDay = rday.getDay();
                        var day_class = dowClass[getDay];
                        if (holidays.indexOf((new Date(rday.getFullYear(), rday.getMonth(), rday.getDate())).getTime()) > -1) {
                            day_class = "holiday";
                        }

                        dayArr.push('<div class="row date ' + day_class + '" '
                                + ' id="dh-' + tools.genId(rday.getTime()) + '" offset="' + i * tools.getCellSize() + '" repdate="' + rday.genRepDate() + '"> '
                                + ' <div class="fn-label">' + rday.getDate() + '</div></div>');
                        dowArr.push('<div class="row day ' + day_class + '" '
                                + ' id="dw-' + tools.genId(rday.getTime()) + '"  repdate="' + rday.genRepDate() + '"> '
                                + ' <div class="fn-label">' + settings.dow[getDay] + '</div></div>');
                    } //for

                    // Last year
                    yearArr.push(
                        '<div class="row header year" style="width: '
                        + tools.getCellSize() * daysInYear + 'px;"><div class="fn-label">'
                        + year
                        + '</div></div>');

                    // Last month
                    monthArr.push(
                        '<div class="row header month" style="width: '
                        + tools.getCellSize() * daysInMonth + 'px"><div class="fn-label">'
                        + settings.months[month]
                        + '</div></div>');

                    var dataPanel = this.dataPanel(gantt, range.length * tools.getCellSize());
                    var header = $('<div class="header" />').appendTo(dataPanel);

                    // Append panel elements

                    header.append('<div class="row">' + yearArr.join("") + '</div>');
                    header.append('<div class="row">' + monthArr.join("") + '</div>');
                    header.append('<div class="row">' + dayArr.join("") + '</div>');
                    header.append('<div class="row">' + dowArr.join("") + '</div>');
                    break;
            }

            return $('<div class="rightPanel"></div>').append(dataPanel);
        };

        // **Navigation**
        Gantt.prototype.navigation = function (gantt) {
            var ganttNavigate = null;

            ganttNavigate = $('<div class="navigate" />')
                .append($('<span role="button" class="nav-link nav-page-back"/>')
                    .html('&lt;')
                    .click(function () {
                        gantt.navigatePage(gantt, -1);
                    }))
                .append($('<div class="page-number"/>')
                        .append($('<span/>')
                            .html(gantt.pageNum + 1 + ' of ' + gantt.pageCount)))
                .append($('<span role="button" class="nav-link nav-page-next"/>')
                    .html('&gt;')
                    .click(function () {
                        gantt.navigatePage(gantt, 1);
                    }))
                .append($('<span role="button" class="nav-link nav-begin"/>')
                    .html('&#124;&lt;')
                    .click(function () {
                        gantt.navigateTo(gantt, 'begin');
                    }))
                .append($('<span role="button" class="nav-link nav-prev-week"/>')
                    .html('&lt;&lt;')
                    .click(function () {
                        gantt.navigateTo(gantt, tools.getCellSize() * -7);
                    }))
                .append($('<span role="button" class="nav-link nav-prev-day"/>')
                    .html('&lt;')
                    .click(function () {
                        gantt.navigateTo(gantt, tools.getCellSize() * -1);
                    }))
                .append($('<span role="button" class="nav-link nav-now"/>')
                    .html('&#9679;')
                    .click(function () {
                        gantt.navigateTo(gantt, 'now');
                    }))
                .append($('<span role="button" class="nav-link nav-next-day"/>')
                    .html('&gt;')
                    .click(function () {
                        gantt.navigateTo(gantt, tools.getCellSize() * 1);
                    }))
                .append($('<span role="button" class="nav-link nav-next-week"/>')
                    .html('&gt;&gt;')
                    .click(function () {
                        gantt.navigateTo(gantt, tools.getCellSize() * 7);
                    }))
                .append($('<span role="button" class="nav-link nav-end"/>')
                    .html('&gt;&#124;')
                    .click(function () {
                        gantt.navigateTo(gantt, 'end');
                    }))
                .append($('<span role="button" class="nav-link nav-zoomIn"/>')
                    .html('&#43;')
                    .click(function () {
                        gantt.zoomInOut(gantt, -1);
                    }))
                .append($('<span role="button" class="nav-link nav-zoomOut"/>')
                    .html('&#45;')
                    .click(function () {
                        gantt.zoomInOut(gantt, 1);
                    }));
            
            return $('<div class="bottom"/>').append(ganttNavigate);
        },

        // **Progress Bar**
        // Return an element representing a progress of position within
        // the entire chart
        Gantt.prototype.createProgressBar = function (days, cls, desc, label, dataObj) {
            var cellWidth = tools.getCellSize();
            var barMarg = tools.getProgressBarMargin() || 0;
            var bar = $('<div class="bar"><div class="fn-label">' + label + '</div></div>')
                    .addClass(cls)
                    .css({
                        width: ((cellWidth * days) - barMarg) + 5
                    })
                    .data("dataObj", dataObj);

            if (desc) {
                bar
                  .mouseover(function (e) {
                      var hint = $('<div class="fn-gantt-hint" />').html(desc);
                      $("body").append(hint);
                      hint.css("left", e.pageX);
                      hint.css("top", e.pageY);
                      hint.show();
                  })
                  .mouseout(function () {
                      $(".fn-gantt-hint").remove();
                  })
                  .mousemove(function (e) {
                      $(".fn-gantt-hint").css("left", e.pageX);
                      $(".fn-gantt-hint").css("top", e.pageY + 15);
                  });
            }
            bar.click(function (e) {
                e.stopPropagation();
                settings.onItemClick($(this).data("dataObj"));
            });
            return bar;
        },

        // Remove the `wd` (weekday) class and add `today` class to the
        // current day/week/month (depending on the current scale)
        Gantt.prototype.markNow = function (gantt) {
            switch (settings.scale) {
                case "weeks":
                    var cd = Date.parse(new Date());
                    cd = (Math.floor(cd / 36400000) * 36400000);
                    gantt.$element.find(':findweek("' + cd + '")').removeClass('wd').addClass('today');
                    break;
                case "months":
                    gantt.$element.find(':findmonth("' + new Date().getTime() + '")').removeClass('wd').addClass('today');
                    break;
                default:
                    var cd = Date.parse(new Date());
                    cd = (Math.floor(cd / 36400000) * 36400000);
                    gantt.$element.find(':findday("' + cd + '")').removeClass('wd').addClass('today');
                    break;
            }
        },

        // **Fill the Chart**
        // Parse the data and fill the data panel
        Gantt.prototype.fillData = function (gantt, datapanel, leftpanel) {
            var rightPanel = datapanel.closest('.rightPanel');
            var dataPanelWidth = datapanel.width();
            var contentHeight = datapanel.height() - leftpanel.children('.spacer').height() - tools.getCellSize();
            datapanel = $('<div class="content" />').width(rightPanel.width()).appendTo(datapanel);
            datapanel = $('<div class="bars" />').width(dataPanelWidth).appendTo(datapanel);
            
            var invertColor = function (colStr) {
                try {
                    colStr = colStr.replace("rgb(", "").replace(")", "");
                    var rgbArr = colStr.split(",");
                    var R = parseInt(rgbArr[0], 10);
                    var G = parseInt(rgbArr[1], 10);
                    var B = parseInt(rgbArr[2], 10);
                    var gray = Math.round((255 - (0.299 * R + 0.587 * G + 0.114 * B)) * 0.9, 1);
                    return "rgb(" + gray + ", " + gray + ", " + gray + ")";
                } catch (err) {
                    return "";
                }
            };
            // Loop through the values of each data element and set a row
            $.each(gantt.data, function (i, entry) {
                if (i >= gantt.pageNum * settings.itemsPerPage && i < (gantt.pageNum * settings.itemsPerPage + settings.itemsPerPage)) {
                    $.each(entry.values, function (j, day) {
                        var _bar = null;

                        switch (settings.scale) {
                            // **Hourly data**
                            case "hours":
                                var dFrom = tools.genId(tools.dateDeserialize(day.from).getTime(), gantt.scaleStep);
                                var from = gantt.$element.find('#dh-' + dFrom);

                                var dTo = tools.genId(tools.dateDeserialize(day.to).getTime(), gantt.scaleStep);
                                var to = gantt.$element.find('#dh-' + dTo);

                                var cFrom = from.attr("offset");
                                var cTo = to.attr("offset");
                                var dl = Math.floor((cTo - cFrom) / tools.getCellSize()) + 1;

                                _bar = gantt.createProgressBar(
                                            dl,
                                            day.customClass ? day.customClass : "",
                                            day.desc ? day.desc : "",
                                            day.label ? day.label : "",
                                            day.dataObj ? day.dataObj : null
                                        );

                                // find row
                                var topEl = gantt.$element.find("#rowheader" + i);

                                var top = tools.getCellSize() * 5 + 2 + parseInt(topEl.attr("offset"), 10);
                                _bar.css({ 'margin-left': Math.floor(cFrom) });

                                datapanel.append(_bar);
                                break;

                            // **Weekly data**
                            case "weeks":
                                var dtFrom = tools.dateDeserialize(day.from);
                                var dtTo = tools.dateDeserialize(day.to);

                                if (dtFrom.getDate() <= 3 && dtFrom.getMonth() === 0) {
                                    dtFrom.setDate(dtFrom.getDate() + 4);
                                }

                                if (dtFrom.getDate() <= 3 && dtFrom.getMonth() === 0) {
                                    dtFrom.setDate(dtFrom.getDate() + 4);
                                }

                                if (dtTo.getDate() <= 3 && dtTo.getMonth() === 0) {
                                    dtTo.setDate(dtTo.getDate() + 4);
                                }

                                var from = gantt.$element.find("#" + dtFrom.getWeekId());

                                var cFrom = from.attr("offset");

                                var to = gantt.$element.find("#" + dtTo.getWeekId());
                                var cTo = to.attr("offset");

                                var dl = Math.round((cTo - cFrom) / tools.getCellSize()) + 1;

                                _bar = gantt.createProgressBar(
                                         dl,
                                         day.customClass ? day.customClass : "",
                                         day.desc ? day.desc : "",
                                         day.label ? day.label : "",
                                        day.dataObj ? day.dataObj : null
                                    );

                                // find row
                                var topEl = gantt.$element.find("#rowheader" + i);

                                var top = tools.getCellSize() * 3 + 2 + parseInt(topEl.attr("offset"), 10);
                                _bar.css({ 'margin-left': Math.floor(cFrom) });

                                datapanel.append(_bar);
                                break;

                            // **Monthly data**
                            case "months":
                                var dtFrom = tools.dateDeserialize(day.from);
                                var dtTo = tools.dateDeserialize(day.to);

                                if (dtFrom.getDate() <= 3 && dtFrom.getMonth() === 0) {
                                    dtFrom.setDate(dtFrom.getDate() + 4);
                                }

                                if (dtFrom.getDate() <= 3 && dtFrom.getMonth() === 0) {
                                    dtFrom.setDate(dtFrom.getDate() + 4);
                                }

                                if (dtTo.getDate() <= 3 && dtTo.getMonth() === 0) {
                                    dtTo.setDate(dtTo.getDate() + 4);
                                }

                                var from = gantt.$element.find("#dh-" + tools.genId(dtFrom.getTime()));
                                var cFrom = from.attr("offset");
                                var to = gantt.$element.find("#dh-" + tools.genId(dtTo.getTime()));
                                var cTo = to.attr("offset");
                                var dl = Math.round((cTo - cFrom) / tools.getCellSize()) + 1;

                                _bar = gantt.createProgressBar(
                                    dl,
                                    day.customClass ? day.customClass : "",
                                    day.desc ? day.desc : "",
                                    day.label ? day.label : "",
                                    day.dataObj ? day.dataObj : null
                                );

                                // find row
                                var topEl = gantt.$element.find("#rowheader" + i);

                                var top = tools.getCellSize() * 2 + 2 + parseInt(topEl.attr("offset"), 10);
                                _bar.css({ 'margin-left': Math.floor(cFrom) });

                                datapanel.append(_bar);
                                break;

                            // **Days**
                            default:
                                var dFrom = tools.genId(tools.dateDeserialize(day.from).getTime());
                                var dTo = tools.genId(tools.dateDeserialize(day.to).getTime());

                                var from = gantt.$element.find("#dh-" + dFrom);
                                var cFrom = from.attr("offset");

                                var dl = Math.floor(((dTo / 1000) - (dFrom / 1000)) / 86400) + 1;
                                _bar = gantt.createProgressBar(
                                            dl,
                                            day.customClass ? day.customClass : "",
                                            day.desc ? day.desc : "",
                                            day.label ? day.label : "",
                                            day.dataObj ? day.dataObj : null
                                    );

                                // find row
                                var topEl = gantt.$element.find("#rowheader" + i);

                                var top = tools.getCellSize() * 4 + 2 + parseInt(topEl.attr("offset"), 10);
                                _bar.css({ 'margin-left': Math.floor(cFrom) });

                                datapanel.append(_bar);

                                break;
                        }
                        var $l = _bar.find(".fn-label");
                        if ($l && _bar.length) {
                            var gray = invertColor(_bar[0].style.backgroundColor);
                            $l.css("color", gray);
                        } else if ($l) {
                            $l.css("color", "");
                        }
                    });

                }
            });
        },
        // **Navigation**
        Gantt.prototype.navigateTo = function (gantt, val) {
            var $rightPanel = gantt.$element.find(".fn-gantt .rightPanel");
            var $dataPanel = $rightPanel.find(".dataPanel");
            var $content = $dataPanel.find(".content");
            var $header = $dataPanel.find(".header");
            $dataPanel.click = function () {
                alert(arguments.join(""));
            };
            var rightPanelWidth = $content.width();
            var dataPanelWidth = $dataPanel.width();

            switch (val) {
                case "begin":
                    $content.animate({
                        scrollLeft: "0px"
                    }, "fast", function () { gantt.repositionLabel(gantt); });
                    gantt.scrollNavigation.panelMargin = 0;
                    break;
                case "end":
                    var mLeft = dataPanelWidth - rightPanelWidth;
                    gantt.scrollNavigation.panelMargin = mLeft;
                    $content.animate({
                        scrollLeft: mLeft + "px"
                    }, "fast", function () { gantt.repositionLabel(gantt); });
                    break;
                case "now":
                    if (!gantt.scrollNavigation.canScroll || !$dataPanel.find(".today").length) {
                        return false;
                    }
                    var max_left = (dataPanelWidth - rightPanelWidth);
                    var cur_marg = $content.scrollLeft();
                    var val = $dataPanel.find(".today").offset().left - $dataPanel.offset().left;
                    if (val <= 0) {
                        val = 0;
                    } else if (val > max_left) {
                        val = max_left;
                    }
                    $content.animate({
                        scrollLeft: val + "px"
                    }, "fast", this.repositionLabel(gantt));
                    gantt.scrollNavigation.panelMargin = val;
                    break;
                default:
                    
                    var max_left = (dataPanelWidth - rightPanelWidth);
                    var cur_marg = $content.scrollLeft();
                    var val = parseInt(cur_marg, 10) + val;
                    if (val >= 0 && val <= max_left) {
                        $content.animate({
                            scrollLeft: val + "px"
                        }, "fast", this.repositionLabel(gantt));
                    }
                    gantt.scrollNavigation.panelMargin = val;
                    break;
            }
        },

        // Navigate to a specific page
        Gantt.prototype.navigatePage = function (gantt, val) {
            if ((gantt.pageNum + val) >= 0 && (gantt.pageNum + val) < Math.ceil(gantt.rowsNum / settings.itemsPerPage)) {
                this.waitToggle(gantt, true, function (gantt) {
                    gantt.pageNum += val;
                    gantt.hPosition = $(".fn-gantt .dataPanel").css("margin-left").replace("px", "");
                    gantt.scaleOldWidth = false;
                    this.init(gantt);
                });
            }
        },

        // Change zoom level
        Gantt.prototype.zoomInOut = function (gantt, val) {
            gantt.waitToggle(gantt, true, function (gantt) {

                var zoomIn = (val < 0);

                var scaleSt = gantt.scaleStep + val * 3;
                scaleSt = scaleSt <= 1 ? 1 : scaleSt === 4 ? 3 : scaleSt;
                var scale = settings.scale;
                var headerRows = gantt.headerRows;
                if (settings.scale === "hours" && scaleSt >= 13) {
                    scale = "days";
                    headerRows = 4;
                    scaleSt = 13;
                } else if (settings.scale === "days" && zoomIn) {
                    scale = "hours";
                    headerRows = 5;
                    scaleSt = 12;
                } else if (settings.scale === "days" && !zoomIn) {
                    scale = "weeks";
                    headerRows = 3;
                    scaleSt = 13;
                } else if (settings.scale === "weeks" && !zoomIn) {
                    scale = "months";
                    headerRows = 2;
                    scaleSt = 14;
                } else if (settings.scale === "weeks" && zoomIn) {
                    scale = "days";
                    headerRows = 4;
                    scaleSt = 13;
                } else if (settings.scale === "months" && zoomIn) {
                    scale = "weeks";
                    headerRows = 3;
                    scaleSt = 13;
                }

                if ((zoomIn && $.inArray(scale, scales) < $.inArray(settings.minScale, scales))
                    || (!zoomIn && $.inArray(scale, scales) > $.inArray(settings.maxScale, scales))) {
                    gantt.init(gantt);
                    return;
                }
                gantt.scaleStep = scaleSt;
                settings.scale = scale;
                gantt.headerRows = headerRows;
                var $rightPanel = gantt.$element.find(".fn-gantt .rightPanel");
                var $dataPanel = $rightPanel.find(".dataPanel");
                gantt.hPosition = $dataPanel.css("margin-left").replace("px", "");
                gantt.scaleOldWidth = ($dataPanel.width() - $rightPanel.width());

                if (settings.useCookie) {
                    $.cookie(gantt.cookieKey + "CurrentScale", settings.scale);
                    // reset scrollPos
                    $.cookie(gantt.cookieKey + "ScrollPos", null);
                }
                gantt.init(gantt);
            });
        },

        // Reposition data labels
        Gantt.prototype.repositionLabel = function (gantt) {
            setTimeout(function () {
                var $dataPanel;
                if (!gantt.element) {
                    $dataPanel = $(".fn-gantt .rightPanel .dataPanel");
                } else {
                    var $rightPanel = gantt.$element.find(".fn-gantt .rightPanel");
                    $dataPanel = $rightPanel.find(".dataPanel");
                }

                if (settings.useCookie) {
                    $.cookie(gantt.cookieKey + "ScrollPos", $dataPanel.css("margin-left").replace("px", ""));
                }
            }, 500);
        },

        // waitToggle
        Gantt.prototype.waitToggle = function (gantt, show, fn) {
            if (show) {
                var eo = gantt.$element.offset();
                var ew = gantt.$element.outerWidth();
                var eh = gantt.$element.outerHeight();
                
                if (!gantt.loader) {
                    gantt.loader = $('<div class="fn-gantt-loader" style="position: absolute; top: ' + eo.top + 'px; left: ' + eo.left + 'px; width: ' + ew + 'px; height: ' + eh + 'px;">'
                    + '<div class="fn-gantt-loader-spinner"><span>' + settings.waitText + '</span></div></div>');
                }
                $("body").append(gantt.loader);
                setTimeout(fn, 100, gantt);

            } else {
                if (gantt.loader) {
                    gantt.loader.remove();
                }
                gantt.loader = null;
            }
        }

        // Utility functions
        // =================
        var tools = {

            // Return the maximum available date in data depending on the scale
            getMaxDate: function (gantt) {
                var maxDate = null;
                $.each(gantt.data, function (i, entry) {
                    $.each(entry.values, function (i, date) {
                        maxDate = maxDate < tools.dateDeserialize(date.to) ? tools.dateDeserialize(date.to) : maxDate;
                    });
                });

                switch (settings.scale) {
                    case "hours":
                        maxDate.setHours(Math.ceil((maxDate.getHours()) / gantt.scaleStep) * gantt.scaleStep);
                        maxDate.setHours(maxDate.getHours() + gantt.scaleStep * 3);
                        break;
                    case "weeks":
                        var bd = new Date(maxDate.getTime());
                        var bd = new Date(bd.setDate(bd.getDate() + 3 * 7));
                        var md = Math.floor(bd.getDate() / 7) * 7;
                        maxDate = new Date(bd.getFullYear(), bd.getMonth(), md === 0 ? 4 : md - 3);
                        break;
                    case "months":
                        var bd = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
                        bd.setMonth(bd.getMonth() + 2);
                        maxDate = new Date(bd.getFullYear(), bd.getMonth(), 1);
                        break;
                    default:
                        maxDate.setHours(0);
                        maxDate.setDate(maxDate.getDate() + 3);
                        break;
                }
                return maxDate;
            },

            // Return the minimum available date in data depending on the scale
            getMinDate: function (gantt) {
                var minDate = null;
                $.each(gantt.data, function (i, entry) {
                    $.each(entry.values, function (i, date) {
                        minDate = minDate > tools.dateDeserialize(date.from) || minDate === null ? tools.dateDeserialize(date.from) : minDate;
                    });
                });
                switch (settings.scale) {
                    case "hours":
                        minDate.setHours(Math.floor((minDate.getHours()) / gantt.scaleStep) * gantt.scaleStep);
                        minDate.setHours(minDate.getHours() - gantt.scaleStep * 3);
                        break;
                    case "weeks":
                        var bd = new Date(minDate.getTime());
                        var bd = new Date(bd.setDate(bd.getDate() - 3 * 7));
                        var md = Math.floor(bd.getDate() / 7) * 7;
                        minDate = new Date(bd.getFullYear(), bd.getMonth(), md === 0 ? 4 : md - 3);
                        break;
                    case "months":
                        var bd = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
                        bd.setMonth(bd.getMonth() - 3);
                        minDate = new Date(bd.getFullYear(), bd.getMonth(), 1);
                        break;
                    default:
                        minDate.setHours(0);
                        minDate.setDate(minDate.getDate() - 3);
                        break;
                }
                return minDate;
            },

            // Return an array of Date objects between `from` and `to`
            parseDateRange: function (from, to) {
                var current = new Date(from.getTime());
                var end = new Date(to.getTime());
                var ret = [];
                var i = 0;
                do {
                    ret[i++] = new Date(current.getTime());
                    current.setDate(current.getDate() + 1);
                } while (current.getTime() <= to.getTime());
                return ret;

            },

            // Return an array of Date objects between `from` and `to`,
            // scaled hourly
            parseTimeRange: function (from, to, scaleStep) {
                var current = new Date(from);
                var end = new Date(to);
                var ret = [];
                var i = 0;
                for(;;) {
					var dayStartTime = new Date(current);
					dayStartTime.setHours(Math.floor((current.getHours()) / scaleStep) * scaleStep);
					
                    if (ret[i] && dayStartTime.getDay() !== ret[i].getDay()) {
						// If mark-cursor jumped to next day, make sure it starts at 0 hours
						dayStartTime.setHours(0);
                    }
					ret[i] = dayStartTime;

					// Note that we use ">" because we want to include the end-time point.
					if(current.getTime() > to.getTime()) break;

					/* BUG-2: current is moved backwards producing a dead-lock! (crashes chrome/IE/firefox)
					 * SEE: https://github.com/taitems/jQuery.Gantt/issues/62
                    if (current.getDay() !== ret[i].getDay()) {
                       current.setHours(0);
                    }
					*/

					current = ktkGetNextDate(current, scaleStep);

                    i++;
                };
				
                return ret;
            },

            // Return an array of Date objects between a range of weeks
            // between `from` and `to`
            parseWeeksRange: function (from, to) {

                var current = new Date(from);
                var end = new Date(to);

                var ret = [];
                var i = 0;
                do {
                    if (current.getDay() === 0) {
                        ret[i++] = current.getDayForWeek();
                    }
                    current.setDate(current.getDate() + 1);
                } while (current.getTime() <= to.getTime());

                return ret;
            },


            // Return an array of Date objects between a range of months
            // between `from` and `to`
            parseMonthsRange: function (from, to) {

                var current = new Date(from);
                var end = new Date(to);

                var ret = [];
                var i = 0;
                do {
                    ret[i++] = new Date(current.getFullYear(), current.getMonth(), 1);
                    current.setMonth(current.getMonth() + 1);
                } while (current.getTime() <= to.getTime());

                return ret;
            },

            // Deserialize a date from a string
            dateDeserialize: function (dateStr) {
                //return eval("new" + dateStr.replace(/\//g, " "));
                var date = eval("new" + dateStr.replace(/\//g, " "));
                return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes());
            },

            // Generate an id for a date
            genId: function (ticks) {
                var t = new Date(ticks);
                switch (settings.scale) {
                    case "hours":
                        var hour = t.getHours();
                        if (arguments.length >= 2) {
                            hour = (Math.floor((t.getHours()) / arguments[1]) * arguments[1]);
                        }
                        return (new Date(t.getFullYear(), t.getMonth(), t.getDate(), hour)).getTime();
                    case "weeks":
                        var y = t.getFullYear();
                        var w = t.getDayForWeek().getWeekOfYear();
                        var m = t.getMonth();
                        if (m === 11 && w === 1) {
                            y++;
                        }
                        return y + "-" + w;
                    case "months":
                        return t.getFullYear() + "-" + t.getMonth();
                    default:
                        return (new Date(t.getFullYear(), t.getMonth(), t.getDate())).getTime();
                }
            },

            // Get the current cell size
            _getCellSize: null,
            getCellSize: function () {
                if (!tools._getCellSize) {
                    $("body").append(
                        $('<div style="display: none; position: absolute;" class="fn-gantt" id="measureCellWidth"><div class="row"></div></div>')
                    );
                    tools._getCellSize = $("#measureCellWidth .row").height();
                    $("#measureCellWidth").empty().remove();
                }
                return tools._getCellSize;
            },

            // Get the current size of the rigth panel
            getRightPanelSize: function () {
                $("body").append(
                    $('<div style="display: none; position: absolute;" class="fn-gantt" id="measureCellWidth"><div class="rightPanel"></div></div>')
                );
                var ret = $("#measureCellWidth .rightPanel").height();
                $("#measureCellWidth").empty().remove();
                return ret;
            },

            // Get the current page height
            getPageHeight: function (gantt) {
                return gantt.pageNum + 1 === gantt.pageCount ? gantt.rowsOnLastPage * tools.getCellSize() : settings.itemsPerPage * tools.getCellSize();
            },

            // Get the current margin size of the progress bar
            _getProgressBarMargin: null,
            getProgressBarMargin: function () {
                if (!tools._getProgressBarMargin) {
                    $("body").append(
                        $('<div style="display: none; position: absolute;" id="measureBarWidth" ><div class="fn-gantt"><div class="rightPanel"><div class="dataPanel"><div class="row day"><div class="bar" /></div></div></div></div></div>')
                    );
                    tools._getProgressBarMargin = parseInt($("#measureBarWidth .fn-gantt .rightPanel .day .bar").css("margin-left").replace("px", ""), 10);
                    tools._getProgressBarMargin += parseInt($("#measureBarWidth .fn-gantt .rightPanel .day .bar").css("margin-right").replace("px", ""), 10);
                    $("#measureBarWidth").empty().remove();
                }
                return tools._getProgressBarMargin;
            }
        };


        this.each(function () {



            var gantt = new Gantt(this);

        });

    };
    
    //Default settings
    $.fn.gantt.defaults = {
        source: null,
        itemsPerPage: 7,
        months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
        dow: ["S", "M", "T", "W", "T", "F", "S"],
        startPos: new Date(),
        navigate: "buttons",
        scale: "days",
        useCookie: false,
        maxScale: "months",
        minScale: "hours",
        waitText: "Please wait...",
        onItemClick: function (data) { return; },
        onAddClick: function (data) { return; },
        onRender: function() { return; },
        scrollToToday: true
    };
    
})(jQuery);

function ktkGetNextDate(currentDate, scaleStep) {
	for(var minIncrements = 1;; minIncrements++) {
		var nextDate = new Date(currentDate);
		nextDate.setHours(currentDate.getHours() + scaleStep * minIncrements);

		if(nextDate.getTime() != currentDate.getTime()) {
			return nextDate;
		}

		// If code reaches here, it's because current didn't really increment (invalid local time) because of daylight-saving adjustments
		// => retry adding 2, 3, 4 hours, and so on (until nextDate > current)
	}	
}
