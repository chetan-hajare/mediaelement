import window from 'global/window';
import document from 'global/document';
import mejs from '../core/mejs';
import {renderer} from '../core/renderer';
import {createEvent, addEvent} from '../utils/dom';
import {typeChecks} from '../utils/media';

/**
 * Vimeo renderer
 *
 * Uses <iframe> approach and uses Vimeo API to manipulate it.
 * All Vimeo calls return a Promise so this renderer accounts for that
 * to update all the necessary values to interact with MediaElement player.
 * Note: IE8 implements ECMAScript 3 that does not allow bare keywords in dot notation;
 * that's why instead of using .catch ['catch'] is being used.
 * @see https://github.com/vimeo/player.js
 *
 */


/**
 * Register Vimeo type based on URL structure
 *
 */
mejs.Utils.typeChecks.push(function (url) {

	url = url.toLowerCase();

	if (url.indexOf('player.vimeo') > -1 || url.indexOf('vimeo.com') > -1) {
		return 'video/x-vimeo';
	} else {
		return null;
	}
});

let vimeoApi = {

	/**
	 * @type {Boolean}
	 */
	isIframeStarted: false,
	/**
	 * @type {Boolean}
	 */
	isIframeLoaded: false,
	/**
	 * @type {Array}
	 */
	iframeQueue: [],

	/**
	 * Create a queue to prepare the creation of <iframe>
	 *
	 * @param {Object} settings - an object with settings needed to create <iframe>
	 */
	enqueueIframe: function (settings) {

		if (this.isLoaded) {
			this.createIframe(settings);
		} else {
			this.loadIframeApi();
			this.iframeQueue.push(settings);
		}
	},

	/**
	 * Load Vimeo API's script on the header of the document
	 *
	 */
	loadIframeApi: () => {

		if (!this.isIframeStarted) {

			var
				script = doc.createElement('script'),
				firstScriptTag = doc.getElementsByTagName('script')[0],
				done = false;

			script.src = 'https://player.vimeo.com/api/player.js';

			// Attach handlers for all browsers
			script.onload = script.onreadystatechange = () => {
				if (!done && (!this.readyState || this.readyState === undefined ||
					this.readyState === "loaded" || this.readyState === "complete")) {
					done = true;
					vimeoApi.iFrameReady();
					script.onload = script.onreadystatechange = null;
				}
			};
			firstScriptTag.parentNode.insertBefore(script, firstScriptTag);
			this.isIframeStarted = true;
		}
	},

	/**
	 * Process queue of Vimeo <iframe> element creation
	 *
	 */
	iFrameReady: () => {

		this.isLoaded = true;
		this.isIframeLoaded = true;

		while (this.iframeQueue.length > 0) {
			let settings = this.iframeQueue.pop();
			this.createIframe(settings);
		}
	},

	/**
	 * Create a new instance of Vimeo API player and trigger a custom event to initialize it
	 *
	 * @param {Object} settings - an object with settings needed to create <iframe>
	 */
	createIframe: function (settings) {
		let player = new Vimeo.Player(settings.iframe);
		win['__ready__' + settings.id](player);
	},

	/**
	 * Extract numeric value from Vimeo to be loaded through API
	 * Valid URL format(s):
	 *  - https://player.vimeo.com/video/59777392
	 *  - https://vimeo.com/59777392
	 *
	 * @param {String} url - Vimeo full URL to grab the number Id of the source
	 * @return {int}
	 */
	getVimeoId: function (url) {
		if (url === undefined || url === null) {
			return null;
		}

		let parts = url.split('?');

		url = parts[0];

		return parseInt(url.substring(url.lastIndexOf('/') + 1));
	},

	/**
	 * Generate custom errors for Vimeo based on the API specifications
	 *
	 * @see https://github.com/vimeo/player.js#error
	 * @param {Object} error
	 * @param {Object} target
	 */
	errorHandler: function (error, target) {
		let event = createEvent('error', target);
		event.message = error.name + ': ' + error.message;
		mediaElement.dispatchEvent(event);
	}
};

/*
 * Register Vimeo event globally
 *
 */
win.onVimeoPlayerAPIReady = () => {
	vimeoApi.iFrameReady();
};

let vimeoIframeRenderer = {

	name: 'vimeo_iframe',

	options: {
		prefix: 'vimeo_iframe'
	},
	/**
	 * Determine if a specific element type can be played with this render
	 *
	 * @param {String} type
	 * @return {Boolean}
	 */
	canPlayType: function (type) {
		let mediaTypes = ['video/vimeo', 'video/x-vimeo'];

		return mediaTypes.indexOf(type) > -1;
	},
	/**
	 * Create the player instance and add all native events/methods/properties as possible
	 *
	 * @param {MediaElement} mediaElement Instance of mejs.MediaElement already created
	 * @param {Object} options All the player configuration options passed through constructor
	 * @param {Object[]} mediaFiles List of sources with format: {src: url, type: x/y-z}
	 * @return {Object}
	 */
	create: function (mediaElement, options, mediaFiles) {

		// exposed object
		var
			apiStack = [],
			vimeoApiReady = false,
			vimeo = {},
			vimeoPlayer = null,
			paused = true,
			volume = 1,
			oldVolume = volume,
			currentTime = 0,
			bufferedTime = 0,
			ended = false,
			duration = 0,
			url = "",
			i,
			il;

		vimeo.options = options;
		vimeo.id = mediaElement.id + '_' + options.prefix;
		vimeo.mediaElement = mediaElement;

		// wrappers for get/set
		var
			props = mejs.html5media.properties,
			assignGettersSetters = function (propName) {

				let capName = propName.substring(0, 1).toUpperCase() + propName.substring(1);

				vimeo['get' + capName] = () => {
					if (vimeoPlayer !== null) {
						let value = null;

						switch (propName) {
							case 'currentTime':
								return currentTime;

							case 'duration':
								return duration;

							case 'volume':
								return volume;
							case 'muted':
								return volume === 0;
							case 'paused':
								return paused;

							case 'ended':
								return ended;

							case 'src':
								vimeoPlayer.getVideoUrl().then(function (_url) {
									url = _url;
								});

								return url;
							case 'buffered':
								return {
									start: () => {
										return 0;
									},
									end: () => {
										return bufferedTime * duration;
									},
									length: 1
								};
						}

						return value;
					} else {
						return null;
					}
				};

				vimeo['set' + capName] = function (value) {

					if (vimeoPlayer !== null) {

						// do something
						switch (propName) {

							case 'src':
								let url = typeof value === 'string' ? value : value[0].src,
									videoId = vimeoApi.getVimeoId(url);

								vimeoPlayer.loadVideo(videoId).then(() => {
									if (mediaElement.getAttribute('autoplay')) {
										vimeoPlayer.play();
									}

								})['catch'](function (error) {
									vimeoApi.errorHandler(error, vimeo);
								});
								break;

							case 'currentTime':
								vimeoPlayer.setCurrentTime(value).then(() => {
									currentTime = value;
									setTimeout(() => {
										let event = createEvent('timeupdate', vimeo);
										mediaElement.dispatchEvent(event);
									}, 50);
								})['catch'](function (error) {
									vimeoApi.errorHandler(error, vimeo);
								});
								break;

							case 'volume':
								vimeoPlayer.setVolume(value).then(() => {
									volume = value;
									oldVolume = volume;
									setTimeout(() => {
										let event = createEvent('volumechange', vimeo);
										mediaElement.dispatchEvent(event);
									}, 50);
								})['catch'](function (error) {
									vimeoApi.errorHandler(error, vimeo);
								});
								break;

							case 'loop':
								vimeoPlayer.setLoop(value)['catch'](function (error) {
									vimeoApi.errorHandler(error, vimeo);
								});
								break;
							case 'muted':
								if (value) {
									vimeoPlayer.setVolume(0).then(() => {
										volume = 0;
										setTimeout(() => {
											let event = createEvent('volumechange', vimeo);
											mediaElement.dispatchEvent(event);
										}, 50);
									})['catch'](function (error) {
										vimeoApi.errorHandler(error, vimeo);
									});
								} else {
									vimeoPlayer.setVolume(oldVolume).then(() => {
										volume = oldVolume;
										setTimeout(() => {
											let event = createEvent('volumechange', vimeo);
											mediaElement.dispatchEvent(event);
										}, 50);
									})['catch'](function (error) {
										vimeoApi.errorHandler(error, vimeo);
									});
								}
								break;
							default:
								console.log('vimeo ' + vimeo.id, propName, 'UNSUPPORTED property');
						}

					} else {
						// store for after "READY" event fires
						apiStack.push({type: 'set', propName: propName, value: value});
					}
				};

			}
			;
		for (i = 0, il = props.length; i < il; i++) {
			assignGettersSetters(props[i]);
		}

		// add wrappers for native methods
		var
			methods = mejs.html5media.methods,
			assignMethods = function (methodName) {

				// run the method on the Soundcloud API
				vimeo[methodName] = () => {

					if (vimeoPlayer !== null) {

						// DO method
						switch (methodName) {
							case 'play':
								return vimeoPlayer.play();
							case 'pause':
								return vimeoPlayer.pause();
							case 'load':
								return null;

						}

					} else {
						apiStack.push({type: 'call', methodName: methodName});
					}
				};

			}
			;
		for (i = 0, il = methods.length; i < il; i++) {
			assignMethods(methods[i]);
		}

		// Initial method to register all Vimeo events when initializing <iframe>
		win['__ready__' + vimeo.id] = function (_vimeoPlayer) {

			vimeoApiReady = true;
			mediaElement.vimeoPlayer = vimeoPlayer = _vimeoPlayer;

			// do call stack
			for (i = 0, il = apiStack.length; i < il; i++) {

				let stackItem = apiStack[i];

				if (stackItem.type === 'set') {
					let propName = stackItem.propName,
						capName = propName.substring(0, 1).toUpperCase() + propName.substring(1);

					vimeo['set' + capName](stackItem.value);
				} else if (stackItem.type === 'call') {
					vimeo[stackItem.methodName]();
				}
			}

			let vimeoIframe = doc.getElementById(vimeo.id), events;

			// a few more events
			events = ['mouseover', 'mouseout'];

			let assignEvents = function (e) {
				let event = createEvent(e.type, vimeo);
				mediaElement.dispatchEvent(event);
			};

			for (let j in events) {
				let eventName = events[j];
				mejs.addEvent(vimeoIframe, eventName, assignEvents);
			}

			// Vimeo events
			vimeoPlayer.on('loaded', () => {

				vimeoPlayer.getDuration().then(function (loadProgress) {

					duration = loadProgress;

					if (duration > 0) {
						bufferedTime = duration * loadProgress;
					}

					let event = createEvent('loadedmetadata', vimeo);
					mediaElement.dispatchEvent(event);

				})['catch'](function (error) {
					vimeoApi.errorHandler(error, vimeo);
				});
			});

			vimeoPlayer.on('progress', () => {

				paused = vimeo.mediaElement.getPaused();

				vimeoPlayer.getDuration().then(function (loadProgress) {

					duration = loadProgress;

					if (duration > 0) {
						bufferedTime = duration * loadProgress;
					}

					let event = createEvent('progress', vimeo);
					mediaElement.dispatchEvent(event);

				})['catch'](function (error) {
					vimeoApi.errorHandler(error, vimeo);
				});
			});
			vimeoPlayer.on('timeupdate', () => {

				paused = vimeo.mediaElement.getPaused();
				ended = false;

				vimeoPlayer.getCurrentTime().then(function (seconds) {
					currentTime = seconds;
				});

				let event = createEvent('timeupdate', vimeo);
				mediaElement.dispatchEvent(event);

			});
			vimeoPlayer.on('play', () => {
				paused = false;
				ended = false;

				vimeoPlayer.play()['catch'](function (error) {
					vimeoApi.errorHandler(error, vimeo);
				});

				event = createEvent('play', vimeo);
				mediaElement.dispatchEvent(event);
			});
			vimeoPlayer.on('pause', () => {
				paused = true;
				ended = false;

				vimeoPlayer.pause()['catch'](function (error) {
					vimeoApi.errorHandler(error, vimeo);
				});

				event = createEvent('pause', vimeo);
				mediaElement.dispatchEvent(event);
			});
			vimeoPlayer.on('ended', () => {
				paused = false;
				ended = true;

				let event = createEvent('ended', vimeo);
				mediaElement.dispatchEvent(event);
			});

			// give initial events
			events = ['rendererready', 'loadeddata', 'loadedmetadata', 'canplay'];

			for (i = 0, il = events.length; i < il; i++) {
				let event = createEvent(events[i], vimeo);
				mediaElement.dispatchEvent(event);
			}
		};

		var
			height = mediaElement.originalNode.height,
			width = mediaElement.originalNode.width,
			vimeoContainer = doc.createElement('iframe'),
			standardUrl = 'https://player.vimeo.com/video/' + vimeoApi.getVimeoId(mediaFiles[0].src)
			;

		// Create Vimeo <iframe> markup
		vimeoContainer.setAttribute('id', vimeo.id);
		vimeoContainer.setAttribute('width', width);
		vimeoContainer.setAttribute('height', height);
		vimeoContainer.setAttribute('frameBorder', '0');
		vimeoContainer.setAttribute('src', standardUrl);
		vimeoContainer.setAttribute('webkitallowfullscreen', '');
		vimeoContainer.setAttribute('mozallowfullscreen', '');
		vimeoContainer.setAttribute('allowfullscreen', '');

		mediaElement.originalNode.parentNode.insertBefore(vimeoContainer, mediaElement.originalNode);
		mediaElement.originalNode.style.display = 'none';

		vimeoApi.enqueueIframe({
			iframe: vimeoContainer,
			id: vimeo.id
		});

		vimeo.hide = () => {
			vimeo.pause();
			if (vimeoPlayer) {
				vimeoContainer.style.display = 'none';
			}
		};
		vimeo.setSize = (width, height) => {
			vimeoContainer.setAttribute('width', width);
			vimeoContainer.setAttribute('height', height);
		};
		vimeo.show = () => {
			if (vimeoPlayer) {
				vimeoContainer.style.display = '';
			}
		};

		return vimeo;
	}

};

renderer.add(vimeoIframeRenderer);