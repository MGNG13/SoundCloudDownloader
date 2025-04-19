package main

import (
    "fmt"
    "log"
    "os"
    "regexp"
    "strings"
)

func main() {
    // Check if there is at least one argument
    if len(os.Args) < 2 {
        fmt.Println("rename_mp3_files <directory_mp3_files>")
        return
    }
    // Get directory
    mainDirectory := os.Args[1]
    // Get all files in the current directory
    files, err := os.ReadDir(mainDirectory)
    if err != nil {
        log.Fatal(err)
    }
    // Loop through all files
    for _, file := range files {
        // Check if the file is an mp3 file
        if strings.HasSuffix(file.Name(), ".mp3") {
            // Rename the file
            oldName := file.Name()
            newName := cleanFileName(oldName)
            err := os.Rename(mainDirectory+oldName, mainDirectory+newName)
            if err != nil {
              log.Printf("Error renaming file %s: %v", oldName, err)
            } else {
              fmt.Printf("Renamed file: %s -> %s\n", oldName, newName)
            }
        }
    }
}

// Function to clean the file name
func cleanFileName(filename string) string {
    // Replace '/' with ''
    cleanedName := strings.Replace(filename, "/", "", -1)
    cleanedName = strings.Replace(cleanedName, "_", "", -1)
    cleanedName = strings.Replace(cleanedName, "-", "", -1)
    // Replace multiple spaces with a single space
    cleanedName = strings.Join(strings.Fields(cleanedName), " ")
    // Define the regex pattern
    regexPattern := "\\d{10}"
    // Compile the regex pattern
    regex, err := regexp.Compile(regexPattern)
    if err != nil {
        fmt.Println("Error compiling regex pattern:", err)
        return cleanedName
    }
    // Replace the matched substring with an empty string
    return regex.ReplaceAllString(cleanedName, "")
}