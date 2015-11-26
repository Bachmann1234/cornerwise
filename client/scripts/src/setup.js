define(
    ["jquery", "permits", "permits-view", "map-view",
     "details-view", "minimap-view", "preview-view",
     "projects", "projects-view", "tab-view", "filters-view",
     "config"],
    function($, Permits, PermitsView, MapView, DetailsView,
             MinimapView, PreviewView, Projects, ProjectsView,
             TabView, FiltersView, config) {
        return {
            start: function() {
                var permitsCollection = new Permits(),
                    projects = new Projects();

                var mapView = new MapView({
                    collection: permitsCollection,
                    el: "#map"
                });

                var minimapView = new MinimapView({
                    el: "#minimap",
                    linkedMap: mapView.map
                });

                var detailsView = new DetailsView({
                    collection: permitsCollection,
                    el: "#overlay"
                });

                var previewView = new PreviewView({
                    collection: permitsCollection,
                    el: "#preview"
                });

                var tabView = new TabView({
                    el: "#data",
                    subviews: {
                        "projects": new ProjectsView({
                            collection: projects
                        }),
                        "proposals": new PermitsView({
                            collection: permitsCollection
                        })
                    }
                });

                permitsCollection.fetch({dataType: "jsonp"});
                projects.fetch({dataType: "jsonp"});

                // For testing:
                window.permits = permitsCollection;

                return {
                    //permits: permitsView,
                    map: mapView,
                    minimap: minimapView,
                    preview: previewView,
                    details: detailsView,
                    filters: new FiltersView(),
                    exploreView: tabView
                };
            }
        };
    });
