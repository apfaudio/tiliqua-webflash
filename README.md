# `tiliqua-webflash`

A little webapp for updating / flashing [tiliqua](https://github.com/apfelaudio/tiliqua) bitstreams in Web browsers that support WebUSB (like Chrome). It is live at [apfaudio.github.io/tiliqua-webflash](https://apfaudio.github.io/tiliqua-webflash/) and looks like this: 

<img width="1335" height="1174" alt="image" src="https://github.com/user-attachments/assets/3e9df8b5-c110-4e8e-8407-a919b4dca72c" />

# Features

- Auto-detect connected hardware revision and only show bitstreams compatible with it.
- Flash a bitstream archive from your local computer.
- Flash one of any bitstreams in the latest Tiliqua release.
- Bootstrap a Tiliqua from scratch (flash the bootloader and all bitstreams to each slot). This does NOT bootstrap the RP2040, only the ECP5 SPI flash.

# Hacking

I am not a web developer, so this site is a bit spartan. Basically, to build the site, you are going to run a python script, which creates a build/ directory to be statically served. You can serve it locally by:
- Cloning this repository
- Make sure the `tiliqua` submodule is up to date with something like `git submodule update --init --recursive`
- Install [pdm](https://github.com/pdm-project/pdm)
- From the root of this repository, run `pdm install` to install all the dependencies needed to build and serve the site locally
- Run `pdm serve`. Note that this will download the latest Tiliqua gateware release, unzip it to `bitstreams/`, and build an index of every bitstream that is later used to construct the site.
- Open Chrome and go to the addresse shown by the command line. From there, you can use the site locally.

## Structure

This project uses Pyodide to share most of Tiliqua's python code used for flashing bitstream archives to the device. It runs openFPGALoader compiled to WebAssembly and WebUSB in the browser (see acknowledgements below!).

It is basically a static HTML single-page website. It uses [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) to allow SharedArrayBuffer (needed by Pyodide and openFPGALoader wasm) to work even though this site is statically served by GitHub Pages.

# License

Zero-clause BSD. Do whatever you want with the code in this repo.

# Acknowledgements

This project is only made possible by the heavy lifting by Catherine behind the [yowasp project](https://yowasp.org/), making it possible to run openFPGALoader in the browser. Please support their hard work!
