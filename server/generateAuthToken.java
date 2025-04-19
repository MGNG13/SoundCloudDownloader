import java.security.*;
import java.util.*;

public class generateAuthToken {
    public static void main(String args[]) {
        System.out.println(generateAuthHash());
    }

    static String generateAuthHash() {
        String inputString = "Hello world, the world is better with music.";
        // Variables...
        Calendar currentDate = Calendar.getInstance();
        String[] year_array = String.valueOf(currentDate.get(Calendar.YEAR)).split("");
        int year = Integer.parseInt(year_array[2]+year_array[3]);
        String formatDateKey = String.valueOf(year);
        inputString += formatDateKey;
        // Convert input string to ASCII characters
        char[] inputChars = inputString.toCharArray();
        int[] asciiChars = new int[inputChars.length];
        for (int i = 0; i < inputChars.length; i++)
            asciiChars[i] = inputChars[i];
        // Modify ASCII values based on the given pattern
        for (int i = 0; i < asciiChars.length; i++)
            asciiChars[i] += (i % 2 == 0 ? (year / 2) + 1 : year + 1);
        // Convert modified ASCII values back to characters
        StringBuilder modifiedString = new StringBuilder();
        for (int asciiChar : asciiChars) {
            char charCode = (char) asciiChar;
            modifiedString.append(Character.isLetter(charCode) ? charCode : "");
        }
        // Generate hash from the modified string using month and year as seed
        int hashed = 0;
        for (int i = 0; i < modifiedString.length(); i++) {
            hashed = (hashed << 5) + hashed + modifiedString.charAt(i) + year;
            hashed = hashed & hashed; // Convert to 32bit integer
            hashed = Math.abs(hashed); // Make sure it's positive
        }
        try {
            String generatedHashed = modifiedString+"_"+hashed+"_mftechnologydevelopment";
            System.out.println(generatedHashed);
            byte[] hash = MessageDigest.getInstance("SHA-1").digest(generatedHashed.getBytes());
            // Convert byte array to hexadecimal string
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            return "";
        }
    }
}