package com.example.plugin;

public class ScanResult {
    private String scanName;
    private int length;

    public ScanResult(String scanName, int length){
        this.scanName = scanName;
        this.length = length;
    }

    public String getScanName() {
        return scanName;
    }

    public int getLength() {
        return length;
    }
}