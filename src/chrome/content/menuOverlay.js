var folderViewManager = 
{
	folderTree: null,
	currentFolder: null,
	currentView: null,
	viewMenu: null,
	preferences: null,
	
	rdfservice: Components.classes["@mozilla.org/rdf/rdf-service;1"].getService(Components.interfaces.nsIRDFService),
	dataSource: null,
	stateFile: null,
	viewContainer: null,
	
	viewArc: null,
	nameArc: null,
	customArc: null,
	previewArc: null,
	layoutArc: null,
	
	trueLiteral: null,
	falseLiteral: null,
	
	// Initialises the objects. Called onload of the document.
	init: function()
	{
		this.preferences = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch(null);

		this.viewArc=this.rdfservice.GetResource("http://www.blueprintit.co.uk/~dave/thunderbird/viewmanager#view");
		this.nameArc=this.rdfservice.GetResource("http://www.blueprintit.co.uk/~dave/thunderbird/viewmanager#name");
		this.customArc=this.rdfservice.GetResource("http://www.blueprintit.co.uk/~dave/thunderbird/viewmanager#custom");
		this.previewArc=this.rdfservice.GetResource("http://www.blueprintit.co.uk/~dave/thunderbird/viewmanager#preview");
		this.layoutArc=this.rdfservice.GetResource("http://www.blueprintit.co.uk/~dave/thunderbird/viewmanager#layout");

		this.trueLiteral=this.rdfservice.GetLiteral("true");
		this.falseLiteral=this.rdfservice.GetLiteral("false");
		
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
		this.dataSource = this.rdfservice.GetDataSourceBlocking(this.stateFile);

		var viewroot = this.rdfservice.GetResource("views://");
		var cutils = Components.classes["@mozilla.org/rdf/container-utils;1"].getService(Components.interfaces.nsIRDFContainerUtils);
		if (!cutils.IsSeq(this.dataSource,viewroot))
		{
			this.viewContainer=cutils.MakeSeq(this.dataSource,viewroot);
			this.flushData();
		}
		else
		{
			this.viewContainer = Components.classes["@mozilla.org/rdf/container;1"].createInstance(Components.interfaces.nsIRDFContainer);
			this.viewContainer.Init(this.dataSource,viewroot);
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
		this.preferences.QueryInterface(Components.interfaces.nsIPrefBranchInternal).addObserver("mail.pane_config.dynamic",this.layoutChangeObserver,false);
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
			this.dataSource.Assert(newres,this.customArc,this.falseLiteral,true);
			this.viewContainer.AppendElement(newres);
		}
		else
		{
			this.dataSource.Assert(newres,this.customArc,this.trueLiteral,true);
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
		return (result==this.trueLiteral);
	},
	
	// Deletes the current view from the state file.
	deleteView: function(view)
	{
		if (!this.isCustomView(view))
		{
			this.viewContainer.RemoveElement(view,false);
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
		
		var sources = this.dataSource.GetSources(this.viewArc,view,true);
		while (sources.hasMoreElements())
		{
			var source = sources.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
			this.dataSource.Unassert(source,this.viewArc,view);
		}
		
		this.flushData();
	},
	
	saveLayoutState: function(view)
	{
		var target = this.dataSource.GetTarget(view,this.layoutArc,true);
		if (target!=null)
		{
			this.dataSource.Unassert(view,this.layoutArc,target);
		}
		var value = this.rdfservice.GetIntLiteral(this.preferences.getIntPref("mail.pane_config.dynamic"));
		this.dataSource.Assert(view,this.layoutArc,value,true);
	},
	
	savePreviewPaneState: function(view)
	{
		// Save preview pane state
		if (IsMessagePaneCollapsed())
		{
			this.dataSource.Unassert(view,this.previewArc,this.trueLiteral);
			this.dataSource.Assert(view,this.previewArc,this.falseLiteral,true);
		}
		else
		{
			this.dataSource.Unassert(view,this.previewArc,this.falseLiteral);
			this.dataSource.Assert(view,this.previewArc,this.trueLiteral,true);
		}
	},
	
	// Saves the current view settings to the given view resource.
	saveCurrentView: function(view)
	{
		this.savePreviewPaneState(view);
		this.saveLayoutState(view);
		this.flushData();
	},
	
	// Loads the given view from the state file.
	loadView: function(view)
	{
		// Load the preview pane state
		var previewstate = this.dataSource.GetTarget(view,this.previewArc,true);
		if ((previewstate==null)||(previewstate==this.trueLiteral))
		{
			if (IsMessagePaneCollapsed())
			{
				MsgToggleMessagePane();
			}
		}
		else
		{
			if (!IsMessagePaneCollapsed())
			{
				MsgToggleMessagePane();
			}
		}
		
		// Load the layout state
		var value = this.dataSource.GetTarget(view,this.layoutArc,true);
		if (value==null)
		{
			this.preferences.setIntPref("mail.pane_config.dynamic",0);
		}
		else
		{
			this.preferences.setIntPref("mail.pane_config.dynamic",value.QueryInterface(Components.interfaces.nsIRDFInt).Value);
		}
	},
	
	// Flushes any state data to disk
	flushData: function()
	{
		var rds = this.dataSource.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource);
		rds.Flush();
	},
	
	// Finds and checks the appropriate menu item
	checkMenu: function(view)
	{
		if (this.isCustomView(view))
		{
			var menu = document.getElementById("viewmanager_Views_Custom");
			menu.setAttribute("checked","true");
		}
		else
		{
			var menu = document.getElementById("viewmanager_Views_Popup");
			var child = menu.firstChild;
			while (child!=null)
			{
				if (child.resource==view)
				{
					child.setAttribute("checked","true");
					return;
				}
				child=child.nextSibling;
			}
		}
	},
	
	// Occurs when someone selects the copy menu
	copyView: function(menu)
	{
		var newname = prompt("Enter a name for the new view:","");
		if (newname!=null)
		{
			if (newname.length==0)
			{
				alert("You must enter a name for the view.");
			}
			else
			{
				this.dataSource.Unassert(this.currentFolder,this.viewArc,this.currentView);
				var newview = this.copyCurrentView(newname,false);
				if (this.isCustomView(this.currentView))
				{
					this.deleteView(this.currentView);
				}
				this.currentView=newview;
				this.dataSource.Assert(this.currentFolder,this.viewArc,this.currentView,true);
				this.flushData();
				this.checkMenu(this.currentView);
			}
		}
	},
	
	// Occurs when someone selects a preset view from the menu
	changeView: function(menu)
	{
		if (menu.resource!=this.currentView)
		{
			this.dataSource.Unassert(this.currentFolder,this.viewArc,this.currentView,true);
			if (this.isCustomView(this.currentView))
			{
				this.deleteView(this.currentView);
			}
			this.currentView=menu.resource;
			this.dataSource.Assert(this.currentFolder,this.viewArc,this.currentView,true);
			this.flushData();
			
			this.loadView(this.currentView);
		}
	},
	
	// Occurs when someone selects the custom view from the menu.
	changeViewCustom: function(menu)
	{
		if (!this.isCustomView(this.currentView))
		{
			this.dataSource.Unassert(this.currentFolder,this.viewArc,this.currentView);
			this.currentView=this.copyCurrentView("custom",true);
			this.dataSource.Assert(this.currentFolder,this.viewArc,this.currentView,true);
			this.flushData();
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
				this.checkMenu(this.currentView);
			}
			else if (newview!=this.currentView)
			{
				// change view
				this.currentView=newview;
				this.loadView(this.currentView);
				this.checkMenu(newview);
			}
		}
	},
	
	startupListener:
	{
		handleEvent: function(event)
		{
			folderViewManager.init();
		}
	},
	
	layoutChangeObserver:
	{
		observe: function(subject, topic, data)
		{
			folderViewManager.saveLayoutState(folderViewManager.currentView);
			folderViewManager.flushData();
		}
	},
	
	previewPaneToggledListener: 
	{
		handleEvent: function(event)
		{
			folderViewManager.savePreviewPaneState(folderViewManager.currentView);
			folderViewManager.flushData();
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
