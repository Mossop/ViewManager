var folderViewManager = 
{
	folderTree: null,
	currentFolder: null,
	currentView: null,
	viewMenu: null,
	
	rdfservice: Components.classes["@mozilla.org/rdf/rdf-service;1"].getService(Components.interfaces.nsIRDFService),
	viewArc: null,
	nameArc: null,
	customArc: null,
	dataSource: null,
	stateFile: null,
	
	// Initialises the objects. Called onload of the document.
	init: function()
	{
		this.viewArc=this.rdfservice.GetResource("http://www.blueprintit.co.uk/~dave/thunderbird/viewmanager#view");
		this.nameArc=this.rdfservice.GetResource("http://www.blueprintit.co.uk/~dave/thunderbird/viewmanager#name");
		this.customArc=this.rdfservice.GetResource("http://www.blueprintit.co.uk/~dave/thunderbird/viewmanager#custom");

		var dirService = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
		var filename = dirService.get("ProfD",Components.interfaces.nsIFile)
				.QueryInterface(Components.interfaces.nsIFile);
		filename.append("viewmanager.rdf");
		if (!filename.exists())
		{
			filename.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE,660);
		}
		
		var ioService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
		this.stateFile = ioService.newFileURI(filename).asciiSpec;
		//dump(stateFile);
		this.dataSource = this.rdfservice.GetDataSource(this.stateFile);

		var viewroot = this.rdfservice.GetResource("views://");
		var cutils = Components.classes["@mozilla.org/rdf/container-utils;1"].getService(Components.interfaces.nsIRDFContainerUtils);
		if (!cutils.IsSeq(this.dataSource,viewroot))
		{
			cutils.MakeSeq(this.dataSource,viewroot);
			this.flushData();
		}
		
		this.viewMenu = document.getElementById("viewmanager_Views");
		this.viewMenu.database.AddDataSource(this.dataSource);
		this.viewMenu.builder.rebuild();

		this.folderTree = document.getElementById("folderTree");
		this.folderTree.addEventListener("select",this.folderSelectedListener,false);
		var paneToggleKey = document.getElementById("key_toggleMessagePane");
		paneToggleKey.addEventListener("command",this.previewPaneToggledListener,false);
		var paneToggleMenu = document.getElementById("menu_showMessage");
		paneToggleMenu.addEventListener("command",this.previewPaneToggledListener,false);
	},
	
	// Stores the current vuew as a new view in the statefile.
	// name is the name for the view. custom says whether it is a custom view or not.
	// returns the view resource.
	copyCurrentView: function(name,custom)
	{
		var ct = 1;
		var newres = this.rdfservice.GetResource("views://view"+ct);
		var testname = this.dataSource.GetTarget(newres,this.nameArc,true);
		while (testname!=null)
		{
			ct++;
			newres = this.rdfservice.GetResource("views://view"+ct);
			testname = this.dataSource.GetTarget(newres,this.nameArc,true);
		}
		this.dataSource.Assert(newres,this.nameArc,this.rdfservice.GetLiteral(name),true);
		if (!custom)
		{
			this.dataSource.Assert(newres,this.customArc,this.rdfservice.GetLiteral("false"),true);
			var container = Components.classes["@mozilla.org/rdf/container;1"].createInstance(Components.interfaces.nsIRDFContainer);
			container.Init(this.dataSource,this.rdfResource.GetResource("views://"));
		}
		else
		{
			this.dataSource.Assert(newres,this.customArc,this.rdfservice.GetLiteral("true"),true);
		}
		this.flushData();
		this.saveCurrentView(newres);
		return newres;
	},
	
	// Tests if the given view resource represents a custom view
	isCustomView: function(view)
	{
		var result = this.dataSource.GetTarget(view,this.customArc,true);
		if (result==null)
			return false;
		return (result.QueryInterface(Components.interfaces.nsIRDFLiteral).Value=="true");
	},
	
	// Loads the given view from the state file.
	loadView: function(view)
	{
	},
	
	// Deletes the current view from the state file.
	deleteView: function(view)
	{
		if (this.isCustomView(view))
		{
		}
		
		// Simple and thorough, wipe out all assertions about this view.
		
		var arcs = this.dataSource.ArcLabelsOut(view);
		while (arcs.hasMoreElements())
		{
			var arc = arcs.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
			var targets = this.dataSource.GetTargets(view,arc,true);
			while (targets.hasMoreElements())
			{
				var target = targets.getNext().QueryInterface(Components.interfaces.nsIRDFNode);
				this.dataSource.Unassert(view,arc,target);
			}
		}
		this.flushData();
	},
	
	// Saves the current view settings to the given view resource.
	saveCurrentView: function(view)
	{
	},
	
	// Flushes any state data to disk
	flushData: function()
	{
		var rds = this.dataSource.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource);
		rds.Flush();
	},
	
	// Occurs when someone selects a preset view from the menu
	changeView: function(view)
	{
		if (view.getAttribute("checked")!="true")
		{
			this.dataSource.Unassert(this.currentFolder,this.viewArc,this.currentView,true);
			if (isCustomView(this.currentView))
			{
				deleteView(this.currentView);
			}
			this.currentView=view.resource;
			this.dataSource.Assert(this.currentFolder,this.viewArc,this.currentView,true);
			this.flushData();
			
			this.loadView(this.currentView);

			view.setAttribute("checked","true");
		}
	},
	
	// Occurs when someone selects the custom view from the menu.
	changeViewCustom: function(view)
	{
		if (view.getAttribute("checked")!="true")
		{
			this.dataSource.Unassert(this.currentFolder,this.viewArc,this.currentView);
			this.currentView=this.copyCurrentView("custom",true);
			this.dataSource.Assert(this.currentFolder,this.viewArc,this.currentView,true);
			this.flushData();
			view.setAttribute("checked","true");
		}
	},
	
	folderSelected: function()
	{
		//alert("folder changed");
    var folderSelection = this.folderTree.treeBoxObject.selection;

		// This prevents a folder from being loaded in the case that the user
		// has right-clicked on a folder different from the one that was
		// originally highlighted.  On a right-click, the highlight (selection)
		// of a row will be different from the value of currentIndex, thus if
		// the currentIndex is not selected, it means the user right-clicked
		// and we don't want to load the contents of the folder.
		if (!folderSelection.isSelected(folderSelection.currentIndex))
			return;

		if (folderSelection.count == 1)
		{
			var startIndex = {};
			var endIndex = {};
			folderSelection.getRangeAt(0, startIndex, endIndex);
			var folderResource = this.folderTree.builderView.getResourceAtIndex(startIndex.value);
			this.currentFolder = folderResource.QueryInterface(Components.interfaces.nsIRDFResource);
			var newview = this.dataSource.GetTarget(this.currentFolder,this.viewArc,true);
			
			if (newview==null) // No set view for this folder, save what the view is as a custom one
			{
				this.currentView=this.copyCurrentView("custom",true);
				this.dataSource.Assert(this.currentFolder,this.viewArc,this.currentView,true);
				this.flushData();
				document.getElementById("viewmanager_Views_Custom").setAttribute("checked","true");
			}
			else if (newview!=this.currentView)
			{
				// change view
				this.currentView=newview;
				this.loadView(this.currentView);
			}
		}
	},
	
	previewPaneToggled: function()
	{
		alert("pane toggled");
	},
	
	startupListener:
	{
		handleEvent: function(event)
		{
			folderViewManager.init();
		}
	},
	
	previewPaneToggledListener: 
	{
		handleEvent: function(event)
		{
			folderViewManager.previewPaneToggled();
		}
	},
	
	folderSelectedListener: 
	{
		handleEvent: function(event)
		{
			folderViewManager.folderSelected();
		}
	}
}

window.addEventListener("load", folderViewManager.startupListener, false);
