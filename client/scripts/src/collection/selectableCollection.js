define(["backbone", "underscore", "app-state", "utils"],
       function(B, _, appState, $u) {
           /**
            * @constructor
            * A collection that keeps track of which items are selected.
            *
            * Events:
            * - selection (collection, ids)
            *   Triggered when the selection changed
            *   ids: ids of all selected children, including those
            *   that have not yet been loaded.
            *
            * - selectionLoaded (collection, ids, loadedIds)
            *   Triggered when the entire selection is loaded (meaning that
            *   there is local data for id in the selection).
            *   ids: ids of all selected children
            *
            * - selectionRemoved (collection, ids, selectedIds)
            *   ids: ids of all deselected children
            *   selectedIds: ids of selected children
            *
            * - selectionAdded (collection, ids)
            *
            * NOTE: Selection ids are always stored as strings.
            */
           var SelectableCollection = B.Collection.extend({
               initialize: function(models, options) {
                   B.Collection.prototype.initialize.call(this, models, options);

                   // The ids of the selected members that are loaded
                   // and available.
                   if (options && options.selection)
                       this.selection = options.selection;
                   else
                       this.selection = [];

                   // The ids of selected members that are not loaded
                   // yet.
                   this.pending = [];

                   this.on("add", this.onAdd, this)
                       .on("update", this.onUpdate, this);

                   if (this.hashParam) {
                       appState.onStateKeyChange(this.hashParam, function(ids, oldIds) {
                           ids = ids ? ids.split(",") : [];
                           this._setSelection(ids);
                       }, this);
                   }
                   if (this.sortParam) {
                       appState.onStateKeyChange(
                           this.sortParam,
                           function(newSort, oldSort) {
                               var desc = newSort[0] === "-",
                                   key = desc ? newSort.slice(1) : newSort;
                               this.sortByField(key, desc);
                           }, this);
                   }
               },

               fetch: function() {
                   this.trigger("fetching");
                   var xhr = B.Collection.prototype.fetch.apply(this, arguments);
                   var self = this;
                   xhr.fail(function(err) {
                       self.trigger("fetchingFailed");
                   }).always(function() {
                       self.trigger("fetchingComplete");
                   });

                   return xhr;
               },

               getModelName: function() {
                   return this.model.modelName || "model";
               },

               getAll: function(ids) {
                   return _.map(ids, this.getAll, this);
               },

               setSelection: function(selection) {
                   if (!this.hashParam)
                       return this._setSelection(selection);

                   if (!_.isArray(selection))
                       selection = [selection];

                   appState.setHashKey(this.hashParam,
                                       selection.join(","));
                   return null;
               },

               /**
                * @param {number|number[]} selection An id or ids of the
                * model(s) to select.
                * @param {?boolean} add
                */
               _setSelection: function(selection, add) {
                   if (!_.isArray(selection))
                       selection = [selection];

                   if (add)
                       selection = _.union(this.selection, selection);
                   else
                       this.pending = [];

                   var deselect = _.difference(this.selection, selection);
                   _.each(deselect,
                          function(id) {
                              var member = this.get(id);
                              if (member)
                                  member.set("_selected", false);
                          },
                          this);
                   var select = _.difference(selection, this.selection),
                       pending = [];
                   _.each(select,
                          function(id) {
                              var member = this.get(id);
                              if (member)
                                  member.set("_selected", true);
                              else
                                  pending.push(id);
                          },
                          this);

                   pending = _.union(pending, this.pending);
                   this.pending = pending;
                   this.selection = _.difference(selection, pending);

                   if (select.length || deselect.length)
                       this.trigger("selection", this, selection);
                   if (select.length)
                       this.trigger("selectionAdded", this, select);
                   if (deselect.length)
                       this.trigger("selectionRemoved", this, deselect, select);

                   if (!pending.length)
                       this.trigger("selectionLoaded", this, selection, pending);

               },

               onAdd: function(model, coll) {
                   // Check if the added model is one we're waiting for:
                   var id = "" + model.id;
                   if (_.contains(this.pending, id)) {
                       this.pending = _.without(this.pending, id);
                       this.selection.push(id);
                       this.trigger("selection", this, this.selection);

                       if (!this.pending.length)
                           this.trigger("selectionLoaded", this, this.selection,
                                        [id]);

                       model.set("_selected", true);
                   }
               },

               onUpdate: function(coll) {
                   var ids = _.pluck(coll.models, "id"),
                       keep_ids = _.intersection(this.selection, ids),
                       removed_ids = _.difference(this.selection, keep_ids);

                   this.selection = keep_ids;
                   if (removed_ids.length) {
                       this.trigger("selectionRemoved", this,
                                    removed_ids, keep_ids);
                   }
               },

               getSelectedIndex: function() {
                   var id = this.selection[0];

                   return id ?
                       _.findIndex(this.models, $u.idIs(id)) : -1;
               },

               selectRelative: function(dir) {
                   var idx = this.getSelectedIndex(),
                       model = this.at(idx+dir) || this.at(dir < 0 ? -1 : 0);

                   if (model)
                       this.setSelection("" + model.id);
                   return model;
               },

               /*
                * @returns {?Model}
                */
               selectNext: function() {
                   return this.selectRelative(1);
               },

               /*
                * @returns {?Model}
                */
               selectPrev: function() {
                   return this.selectRelative(-1);
               },

               /**
                * @return {Proposal[]}
                */
               getSelection: function() {
                   return $u.keep(this.selection, this.get, this);
               },

               getSelectionIds: function() {
                   return this.selection;
               },

               // Sorting

               /**
                * A map of fieldName -> comparator function
                * 
                */
               comparators: {},

               /**
                * @param {String} name
                * @param {Boolean} desc true to sort descending
                */
               sortByField: function(name, desc) {
                   var order = desc ? -1 : 1;
                   this.sortField = name;
                   this.desc = desc;

                   if (!name) {
                       this.comparator = false;
                   } else if (this.comparators[name]) {
                       var cmp = this.comparators[name];
                       this.comparator = desc ?
                           (function(v1, v2) { return -cmp(); }) : cmp;
                       this.sort();
                   } else {
                       this.comparator = function(p1, p2) {
                           var v1 = p1.get(name),
                               v2 = p2.get(name);

                           return order * ((v1 > v2) ? 1 : (v2 > v1) ? -1 : 0);
                       };
                       this.sort();
                   }
               }
           });

           return SelectableCollection;
       });
