
class WPWorker {
	WORDPRESS_ROOT = '/preload/wordpress';
	constructor() {
		this.channel = new BroadcastChannel( 'wordpress-wasm' );
	}
	async writeFile( path, contents ) {
		const { stdout } = await this.run( `<?php
            function join_paths($p1, $p2) {
                return preg_replace('#/+#', '/', $p1 . '/' . $p2);
            }
            $root_path = ${ JSON.stringify( this.WORDPRESS_ROOT ) };
            $file_path = ${ JSON.stringify( path ) };
            $contents = ${ JSON.stringify( contents ) };
            file_put_contents( join_paths($root_path, $file_path), $contents );
        ` );
		return stdout;
	}
	async readFile( path ) {
		const { stdout } = await this.run( `<?php
            function join_paths($p1, $p2) {
                return preg_replace('#/+#', '/', $p1 . '/' . $p2);
            }
            $root_path = ${ JSON.stringify( this.WORDPRESS_ROOT ) };
            $file_path = ${ JSON.stringify( path ) };
            echo file_get_contents( join_paths($root_path, $file_path) );
        ` );
		return stdout;
	}
	async ls( path = '' ) {
		const { stdout } = await this.run( `<?php
            function join_paths($p1, $p2) {
                return preg_replace('#/+#', '/', $p1 . '/' . $p2);
            }

            $files = [];
            $root_path = ${ JSON.stringify( this.WORDPRESS_ROOT ) };
            $relative_dir_path = ${ JSON.stringify( path ) };
            $absolute_dir_path = join_paths( $root_path, $relative_dir_path );
            foreach(scandir($absolute_dir_path) as $file_name) {
                $file_name = trim($file_name, '/');
                if($file_name === '.' || $file_name === '..') {
                    continue;
                }
                $relative_file_path = join_paths($relative_dir_path, $file_name);
                $file = [
                    'name' => $file_name,
                    'path' => $relative_file_path,
                ];
                $absolute_file_path = join_paths($root_path, $relative_file_path);
                if(is_dir($absolute_file_path)){
                    $file['type'] = 'dir';
                    $file['children'] = [];
                } else {
                    $file['type'] = 'file';
                }
                $files[] = $file;
            }

            // sort by type=dir, name
            usort($files, function($a, $b) {
                if($a['type'] === 'dir' && $b['type'] !== 'dir') {
                    return -1;
                }
                if($a['type'] !== 'dir' && $b['type'] === 'dir') {
                    return 1;
                }
                return strcmp($a['name'], $b['name']);
            });

            echo json_encode($files);
            `,
		);
		return JSON.parse( stdout );
	}
	run( code ) {
		return this.postMessage( {
			type: 'run_php',
			code,
		} );
	}
	postMessage( data ) {
		return new Promise( ( resolve, reject ) => {
			const requestId = Math.random().toString( 36 );
			const responseHandler = ( event ) => {
				if ( event.data.type === 'response' && event.data.requestId === requestId ) {
					this.channel.removeEventListener( 'message', responseHandler );
					clearTimeout( failOntimeout );
					resolve( event.data.result );
				}
			};
			const failOntimeout = setTimeout( () => {
				reject( 'Request timed out' );
				this.channel.removeEventListener( 'message', responseHandler );
			}, 5000 );
			this.channel.addEventListener( 'message', responseHandler );

			this.channel.postMessage( {
				...data,
				requestId,
			} );
		} );
	}
}
export default new WPWorker();
