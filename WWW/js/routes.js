angular.module('app.routes', [])

.config(function($stateProvider, $urlRouterProvider) {

  // Ionic uses AngularUI Router which uses the concept of states
  // Learn more here: https://github.com/angular-ui/ui-router
  // Set up the various states which the app can be in.
  // Each state's controller can be found in controllers.js
  $stateProvider
    
  

      .state('menu.pMIRQuickScanner', {
    url: '/page1',
    views: {
      'side-menu21': {
        templateUrl: 'templates/pMIRQuickScanner.html',
        controller: 'pMIRQuickScannerCtrl'
      }
    }
  })

  .state('menu', {
    url: '/side-menu21',
    templateUrl: 'templates/menu.html',
    abstract:true
  })

  .state('menu.connections', {
    url: '/connections',
    views: {
      'side-menu21': {
        templateUrl: 'templates/connections.html',
        controller: 'connectionsCtrl'
      }
    }
  })

  .state('menu.library', {
    url: '/library',
    views: {
      'side-menu21': {
        templateUrl: 'templates/library.html',
        controller: 'libraryCtrl'
      }
    }
  })

  .state('menu.chemometrics', {
    url: '/Chemometrics',
    views: {
      'side-menu21': {
        templateUrl: 'templates/chemometrics.html',
        controller: 'chemometricsCtrl'
      }
    }
  })

  .state('menu.profiles', {
    url: '/Profiles',
    views: {
      'side-menu21': {
        templateUrl: 'templates/profiles.html',
        controller: 'profilesCtrl'
      }
    }
  })

$urlRouterProvider.otherwise('/side-menu21/page1')

  

});