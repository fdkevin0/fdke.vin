

RAW managing:

use files mostly

```shell

# Rename

# For Common Image files
exiftool -m -d '%Y-%m-%d_%H%M%S' '-filename<${DateTimeOriginal}_${SubSecTimeOriginal}%-c.%e' .

# Nikon

exiftool -m -ext nksc -tagsfromfile %d../%f -d '%Y-%m-%d_%H%M%S' '-filename<${DateTimeOriginal}_${SubSecTimeOriginal}_${ShutterCount}.NEF.%e' NKSC_PARAM
exiftool -m -d '%Y-%m-%d_%H%M%S' '-filename<${DateTimeOriginal}_${SubSecTimeOriginal}_${ShutterCount}.%e' -ext jpg .

# For Nikon nksc files
exiftool -m -ext nksc -tagsfromfile %d../%f -d '%Y-%m-%d_%H%M%S' '-filename<${DateTimeOriginal}_${SubSecTimeOriginal}%-c.NEF.%e' NKSC_PARAM

# For Nikon NEF files
exiftool -m -d '%Y-%m-%d_%H%M%S' '-filename<${DateTimeOriginal}_${SubSecTimeOriginal}%-c.%e' -ext nef -ext jpg .



# Extract JPG from RW2, Panasonic RAW
exiftool -b -JpgFromRaw2 -w %f.JPG -ext RW2
exiftool -tagsFromFile %d%f.RW2 -all:all -overwrite_original -ext JPG .



exiftool -v -progress -r -d "%Y-%m" "-Directory<DateTimeOriginal" .
exiftool -v -progress -r -d '%Y-%m-%d_%H%M%S' '-FileName<${DateTimeOriginal}%-c.%e' '-FileName<${DateTimeOriginal}_${SubSecTimeOriginal}%-c.%e' -ext jpg .

exiftool -m -d '%Y-%m-%d_%H%M%S' '-TestName<${DateTimeOriginal}_${SubSecTimeOriginal}%-c.%e' .

exiftool

```
