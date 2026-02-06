# bibframe.org
HTML for http://www.bibframe.org


* The page is running as a docker image with NGINX serving the compiled HTML.
* The Search/Discovery portion of the page is compiled and built in the docker image build
* To make update to the page (copy / links / layout / etc):
    * You can run locally with `npm run dev`
    * Make changes, commit to git
    * git pull on the server to bring down changes
    * run `./rebuild.sh` to rebuild the image and restart service


    